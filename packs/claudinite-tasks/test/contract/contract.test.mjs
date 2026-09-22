import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, MODEL_MAP, resolveModel, isAgentless } from '../../src/contract/model-map.mjs';
import {
  validateTaskDeclaration, normalizeTaskDeclaration, taskSignalNames, OUTCOMES, SIGNAL_NAMES,
  DEFAULT_AGENT_MODEL, DEFAULT_AUTOMERGE, DESCRIPTION_MAX_WORDS, taskCadence, isScheduledTask,
  declaresCodeWork,
} from '../../src/contract/task-contract.mjs';
import {
  FREQUENCIES, cadenceTermFor,
} from '../../src/contract/calendar.mjs';
import { validateDispatchBody, dispatchFirstLine, DISPATCH_PATH_RE } from '../../src/session/validate-dispatch.mjs';
import { verifyOutcome } from '../../src/session/verify-outcome.mjs';
import { SIGNAL_COLLECTORS } from '../../src/signals/index.mjs';

// --- model-map ---
test('resolveModel maps every family and rejects unknowns; none is agentless', () => {
  for (const f of MODEL_FAMILIES) assert.equal(resolveModel(f), MODEL_MAP[f]);
  assert.equal(resolveModel('none'), null);
  assert.equal(isAgentless('none'), true);
  assert.equal(isAgentless('opus'), false);
  assert.throws(() => resolveModel('gpt'), /unknown model family/);
});

// --- task-contract ---
const validTask = {
  id: 'acme-task-h',
  trigger: 'schedule',
  agent_model: 'opus',
  expected_outcome: 'fresh_pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['due:daily'],
};

test('validateTaskDeclaration accepts a well-formed declaration', () => {
  assert.deepEqual(validateTaskDeclaration(validTask), []);
});

test('validateTaskDeclaration requires agent_execution_timeout on an agentic task — no default', () => {
  const { agent_execution_timeout, ...noBound } = validTask;
  assert.match(validateTaskDeclaration(noBound)[0].what, /no positive-integer "agent_execution_timeout"/);
  // a non-integer or non-positive bound is equally rejected
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 0 }).length);
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 12.5 }).length);
});

test('validateTaskDeclaration: an agentless (none) task needs preprocessing but no execution bound', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes' };
  delete none.agent_execution_timeout;
  delete none.automerge;
  // a bare none task with no work step does nothing → flagged
  assert.match(validateTaskDeclaration(none)[0].what, /declares no work step/);
  // with preprocessing + its timeout it is clean, and needs no execution bound
  assert.deepEqual(
    validateTaskDeclaration({ ...none, code_work: 'node worker.mjs', code_work_timeout: 120 }),
    [],
  );
});

// THE DEFAULTS (#1633, owner 2026-09-03): a declaration says what is particular
// to its task and the door fills the rest — automerge is nothing, agent_model is
// none. The timeouts have no default: an agent or a code-work subprocess always
// carries its own bound, and an agent its worker file. Nor has `preconditions`
// (PRINCIPLES.md): the expression is the whole of when a task runs, and a
// declaration stating none carries the empty one from the door on.
test('normalizeTaskDeclaration fills the defaults, and only where absent', () => {
  const minimal = { id: 't', trigger: 'schedule', preconditions: ['schedule:at-most-daily'], expected_outcome: 'fresh_pr' };
  const filled = normalizeTaskDeclaration(minimal);
  assert.deepEqual(filled.preconditions, ['schedule:at-most-daily']);
  assert.equal(filled.automerge, DEFAULT_AUTOMERGE);
  assert.equal(filled.agent_model, DEFAULT_AGENT_MODEL);
  assert.equal(filled.agent_instructions, undefined);
  assert.equal(filled.agent_execution_timeout, undefined);
  assert.equal(filled.code_work, undefined);
  // …so the minimal declaration is an agentless task with no code work, which does nothing.
  assert.match(validateTaskDeclaration(minimal)[0].what, /declares no work step/);
  assert.deepEqual(validateTaskDeclaration({ ...minimal, code_work: 'node w.mjs', code_work_timeout: 60 }), []);
  // A declared field is kept; a none task takes no automerge default.
  assert.equal(normalizeTaskDeclaration({ ...minimal, agent_model: 'opus' }).agent_model, 'opus');
  assert.deepEqual(normalizeTaskDeclaration({ ...minimal, preconditions: ['substantive-change'] }).preconditions, ['substantive-change']);
  assert.equal(normalizeTaskDeclaration({ ...minimal, automerge: 'anything' }).automerge, 'anything');
  assert.equal(normalizeTaskDeclaration({ ...minimal, expected_outcome: 'no_code_changes' }).automerge, undefined);
  // The editor's pointer leaves at the door.
  assert.equal(normalizeTaskDeclaration({ ...minimal, $schema: 'x' }).$schema, undefined);
});

test('validateTaskDeclaration: agent_instructions is required for an agentic task but not applicable to none', () => {
  // a none task with NO agent_instructions at all is clean — the field is not
  // applicable when there is no agent.
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes', code_work: 'node worker.mjs', code_work_timeout: 120 };
  delete none.agent_execution_timeout;
  delete none.agent_instructions;
  delete none.automerge;
  assert.deepEqual(validateTaskDeclaration(none), []);

  // an agentic task (agent_model !== 'none') with no agent_instructions still fails — no default.
  const { agent_instructions, ...noInstructions } = validTask;
  assert.match(validateTaskDeclaration(noInstructions)[0].what, /no string "agent_instructions"/);
});

test('validateTaskDeclaration validates code_work + its required timeout and containment', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes' };
  delete none.agent_execution_timeout;
  delete none.automerge;
  // preprocessing without a timeout is rejected
  assert.match(
    validateTaskDeclaration({ ...none, code_work: 'node prepare.mjs' })[0].what,
    /"code_work_timeout" is not a positive integer/,
  );
  // a task-local command with a timeout is accepted
  assert.deepEqual(
    validateTaskDeclaration({ ...none, code_work: 'node prepare.mjs', code_work_timeout: 120 }),
    [],
  );
  // an absolute path or a `..` traversal is rejected
  assert.match(
    validateTaskDeclaration({ ...none, code_work: 'node /usr/bin/x.mjs', code_work_timeout: 120 })[0].what,
    /reaches outside the task directory/,
  );
  assert.match(
    validateTaskDeclaration({ ...none, code_work: 'node ../evil.mjs', code_work_timeout: 120 })[0].what,
    /reaches outside the task directory/,
  );
  // Present but unusable — the case between "absent" (the field is optional, so
  // nothing fires) and "valid". A declaration reaches this shape by having the key
  // edited to nothing, which is how a field empties in practice.
  for (const empty of ['', '   ']) {
    assert.match(
      validateTaskDeclaration({ ...none, code_work: empty, code_work_timeout: 120 })[0].what,
      /"code_work" is present but not a non-empty string/,
      `code_work: ${JSON.stringify(empty)} is refused`,
    );
  }
});

// The WRAPPED work step: `code_worker_mjs` names a module, and its rejection branches
// are the ways a field meant to hold a file name ends up holding something else.
test('validateTaskDeclaration: code_worker_mjs is a task-local .mjs file name, bounded like code_work', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes' };
  delete none.agent_execution_timeout;
  delete none.automerge;

  // It satisfies the agentless task's need for a work step, exactly as code_work does.
  assert.deepEqual(validateTaskDeclaration({ ...none, code_worker_mjs: 'worker.mjs', code_work_timeout: 120 }), []);

  // The same bound, named for the field that is actually declared.
  assert.match(
    validateTaskDeclaration({ ...none, code_worker_mjs: 'worker.mjs' })[0].what,
    /"code_worker_mjs" is set but "code_work_timeout" is not a positive integer/,
  );

  const what = (decl) => validateTaskDeclaration({ ...none, code_work_timeout: 120, ...decl })[0].what;
  // A command where a file name belongs: the runner supplies the node invocation.
  assert.match(what({ code_worker_mjs: 'node worker.mjs' }), /is a command rather than a file name/);
  // Something the runner cannot import as an ES module.
  assert.match(what({ code_worker_mjs: 'worker.js' }), /does not name a \.mjs module/);
  assert.match(what({ code_worker_mjs: 'worker' }), /does not name a \.mjs module/);
  // The same containment code_work has.
  assert.match(what({ code_worker_mjs: '/opt/evil.mjs' }), /reaches outside the task directory/);
  assert.match(what({ code_worker_mjs: '../evil.mjs' }), /reaches outside the task directory/);
  // Present but unusable, the branch between absent and valid.
  for (const empty of ['', '   ']) {
    assert.match(what({ code_worker_mjs: empty }), /"code_worker_mjs" is present but not a non-empty string/,
      `code_worker_mjs: ${JSON.stringify(empty)} is refused`);
  }
});

// The two forms answer the same question about the same phase, so a declaration
// carrying both leaves which one runs to whoever reads it.
test('validateTaskDeclaration: code_work and code_worker_mjs are alternatives, never both', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes', code_work_timeout: 120 };
  delete none.agent_execution_timeout;
  delete none.automerge;
  assert.match(
    validateTaskDeclaration({ ...none, code_work: 'node worker.mjs', code_worker_mjs: 'worker.mjs' })[0].what,
    /both "code_work" and "code_worker_mjs" are declared/,
  );
});

// One reader for "is there a work step here", so the two forms cannot drift into one
// being honoured and the other silently skipped.
test('declaresCodeWork reads either form, and neither when there is none', () => {
  assert.equal(declaresCodeWork({ code_work: 'node worker.mjs' }), true);
  assert.equal(declaresCodeWork({ code_worker_mjs: 'worker.mjs' }), true);
  assert.equal(declaresCodeWork({ agent_model: 'opus' }), false);
  assert.equal(declaresCodeWork(null), false);
});

// `model_from_request` is a one-value field: declaring it at all means "take the
// model from the request", so every spelling other than `true` — including the
// `false` an author writes meaning to switch it off — is an authoring error rather
// than the off state. Nothing forced this rejection before.
test('validateTaskDeclaration: model_from_request accepts only a literal true', () => {
  assert.deepEqual(validateTaskDeclaration({ ...validTask, model_from_request: true }), []);
  for (const wrong of [false, 'true', 1, null]) {
    assert.match(
      validateTaskDeclaration({ ...validTask, model_from_request: wrong })[0].what,
      /"model_from_request" .* is not `true`/,
      `model_from_request: ${JSON.stringify(wrong)} is refused`,
    );
  }
});

test('validateTaskDeclaration accepts code_work_required_secrets as a plain list of names (DESIGN §9)', () => {
  // Declarative, not a permission list: the only rule is "a list of names". Where
  // it is declared, and whether the repo has them, are deliberately NOT its business.
  assert.deepEqual(validateTaskDeclaration({ ...validTask, code_work_required_secrets: ['SOME_API_KEY'] }), []);
  assert.deepEqual(validateTaskDeclaration({ ...validTask, code_work_required_secrets: [] }), []);
  assert.deepEqual(validateTaskDeclaration(validTask), []);              // absent is fine
  // Only a shape that could not be read at all is rejected.
  assert.match(validateTaskDeclaration({ ...validTask, code_work_required_secrets: 'SOME_API_KEY' })[0].what, /not an array of secret names/);
  assert.match(validateTaskDeclaration({ ...validTask, code_work_required_secrets: [''] })[0].what, /not an array of secret names/);
});

test('validateTaskDeclaration rejects a code_work_required_secrets name GitHub refuses to create', () => {
  // GitHub reserves the `GITHUB_` prefix: the secret form answers "Secret names must
  // not start with GITHUB_", so such a name can never be configured and the task parks
  // for a secret nobody can add. The one name-shape rule that is not a fact about the
  // repo — it is a fact about the platform, knowable at author time.
  assert.match(
    validateTaskDeclaration({ ...validTask, code_work_required_secrets: ['GITHUB_OAUTH_CLIENT_SECRET'] })[0].what,
    /cannot be created/,
  );
  assert.deepEqual(validateTaskDeclaration({ ...validTask, code_work_required_secrets: ['MY_GITHUB_TOKEN'] }), []);
});

test('validateTaskDeclaration rejects a code_work_required_secrets name inside the code-work namespace', () => {
  // `CLAUDINITE_*` in a task file means the code-work contract, and `task-code-work-env`
  // reads every one it does not recognise as a variable nobody sets. A secret named into
  // that namespace is delivered perfectly well and still trips the rule, so the two
  // cannot coexist — and the collision is knowable here, where the name is chosen.
  assert.match(
    validateTaskDeclaration({ ...validTask, code_work_required_secrets: ['CLAUDINITE_DASHBOARD_CLIENT_SECRET'] })[0].what,
    /code-work namespace/,
  );
  assert.deepEqual(validateTaskDeclaration({ ...validTask, code_work_required_secrets: ['DASHBOARD_OAUTH_CLIENT_SECRET'] }), []);
});

test('validateTaskDeclaration flags every malformed field', () => {
  const problems = validateTaskDeclaration({
    id: '',
    preconditions: ['schedule:at-most-fortnightly'],
    agent_model: 'gpt',
    expected_outcome: 'push',
    agent_instructions: 42,
    precondition_signals: ['commits'],
  });
  const whats = problems.map((p) => p.what).join(' | ');
  assert.match(whats, /no string "id"/);
  assert.match(whats, /"schedule" takes one of at-most-daily, at-most-weekly, at-most-monthly, not "at-most-fortnightly"/);
  assert.match(whats, /not a legal model family/);
  assert.match(whats, /not a legal outcome ceiling/);
  assert.match(whats, /no string "agent_instructions"/);
  assert.match(whats, /"precondition_signals" is retired/);
});

// ONE FORM, and the derivation that comes with it (docs/PRINCIPLES.md,
// #1617). The signal union has a single source — the terms the expression names —
// so the collector cannot disagree with what the gate consults.
test('validateTaskDeclaration accepts the one precondition form, and derives its signals', () => {
  const base = { ...validTask };

  assert.deepEqual(validateTaskDeclaration({ ...base, preconditions: ['substantive-change'] }), []);
  assert.deepEqual(taskSignalNames({ ...base, preconditions: ['substantive-change'] }), ['commits']);

  // Both retired spellings are rejected by name rather than ignored.
  const withFunction = validateTaskDeclaration({ ...base, precondition: () => ({ run: true }) });
  assert.match(withFunction.map((p) => p.what).join(' | '), /"precondition" function, which is retired/);

  const withSignals = validateTaskDeclaration({ ...base, precondition_signals: ['commits'] });
  assert.match(withSignals.map((p) => p.what).join(' | '), /"precondition_signals" is retired/);
});

test('validateTaskDeclaration reads the expression statically: unknown terms and bad arguments', () => {
  const base = { ...validTask };
  const whatOf = (preconditions, terms) => validateTaskDeclaration({ ...base, preconditions }, terms).map((p) => p.what).join(' | ');

  assert.match(whatOf(['no-such-thing']), /unknown condition "no-such-thing"/);
  assert.match(whatOf(['commits-under']), /takes an inline argument and was given none/);
  assert.match(whatOf(['substantive-change:oops']), /takes no argument/);
  // `none` is the retired spelling of the empty expression, wherever it stands.
  assert.match(whatOf(['none']), /"none" is retired/);
  assert.match(whatOf(['substantive-change || none']), /"none" is retired/);
  // The empty expression is legal — a task stating no condition is off the schedule —
  // and a non-array is still the shape error it always was.
  assert.deepEqual(validateTaskDeclaration({ ...base, preconditions: [] }), []);
  assert.match(validateTaskDeclaration({ ...base, preconditions: 'schedule:at-most-daily' }).map((p) => p.what).join(' | '), /not an array/);

  // A task-local term resolves after the built-ins, in one flat namespace…
  const own = new Map([['my-gate', { signals: ['stamp'], holds: () => ({ holds: true }) }]]);
  assert.deepEqual(validateTaskDeclaration({ ...base, preconditions: ['my-gate'] }, own), []);
  assert.deepEqual(taskSignalNames({ ...base, preconditions: ['my-gate'] }, own), ['stamp']);
  // …where shadowing a built-in is loud rather than quietly winning.
  const clash = new Map([['substantive-change', { signals: [], holds: () => ({ holds: true }) }]]);
  assert.match(validateTaskDeclaration({ ...base, preconditions: ['none'] }, clash).map((p) => p.what).join(' | '),
    /redefines the built-in term "substantive-change"/);
});

test('validateTaskDeclaration rejects a non-object export', () => {
  assert.match(validateTaskDeclaration(null)[0].what, /is not a declaration object/);
});

// The contract's signal vocabulary and the collectors are two lists in two modules;
// a signal a term may name with no collector behind it is a permanent null.
test('every signal the contract lets a term name has a collector', () => {
  for (const name of SIGNAL_NAMES) assert.ok(SIGNAL_COLLECTORS.includes(name), `${name} has no collector`);
});

// --- expected_outcome × automerge -----------------------------------------

// The retired ceilings (#1642): `open-pr`/`merged-pr` and the two-word
// `none`/`pr` no longer resolve. A declaration still naming one FAILS rather than
// quietly resolving to something, which is the whole point of the retirement — a
// word nobody reads must not be a word that silently works.
test('a retired outcome ceiling no longer normalizes, and fails validation', () => {
  const { automerge, ...baseTask } = validTask;
  for (const retired of ['open-pr', 'merged-pr', 'none', 'pr']) {
    const decl = normalizeTaskDeclaration({ ...baseTask, expected_outcome: retired });
    assert.equal(decl.expected_outcome, retired, `${retired} passes through unchanged`);
    assert.match(validateTaskDeclaration({ ...baseTask, expected_outcome: retired })[0].what,
      /is not a legal outcome ceiling/, `${retired} is reported`);
  }
  for (const outcome of OUTCOMES) {
    assert.equal(normalizeTaskDeclaration({ ...baseTask, expected_outcome: outcome }).expected_outcome, outcome, `${outcome} is already canonical`);
  }
});

test('validateTaskDeclaration: a pr task that says nothing about automerge lands nothing', () => {
  const { automerge, ...noAutomerge } = validTask;
  assert.deepEqual(validateTaskDeclaration(noAutomerge), []);
  assert.equal(normalizeTaskDeclaration(noAutomerge).automerge, 'nothing');
  for (const policy of ['nothing', 'anything', ['comment-only-changes', 'readme-changes'], ['anything', 'reject:js-code-changes']]) {
    assert.deepEqual(validateTaskDeclaration({ ...validTask, automerge: policy }), [], JSON.stringify(policy));
  }
});

test('validateTaskDeclaration: malformed policies and a policy on a none task are flagged', () => {
  const pr = (policy) => validateTaskDeclaration({ ...validTask, expected_outcome: 'fresh_pr', automerge: policy });
  assert.match(pr([])[0].what, /automerge/);
  assert.match(pr(['reject:js-code-changes'])[0].what, /automerge/);
  assert.match(pr('Not A Policy')[0].what, /automerge/);
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'no_code_changes', code_work: 'node w.mjs', code_work_timeout: 60, automerge: 'anything' };
  delete none.agent_execution_timeout;
  assert.match(validateTaskDeclaration(none)[0].what, /"no_code_changes" task declares "automerge"/);
  // Every outcome that opens a pull request takes a policy; the legacy `none` is
  // judged as what it normalizes to.
  for (const outcome of ['amend_existing_or_create_new_pr', 'supersede_existing_pr']) {
    assert.deepEqual(validateTaskDeclaration({ ...validTask, expected_outcome: outcome }), [], outcome);
    assert.equal(normalizeTaskDeclaration({ ...validTask, expected_outcome: outcome, automerge: undefined }).automerge, 'nothing', outcome);
  }
  assert.match(validateTaskDeclaration({ ...none, expected_outcome: 'no_code_changes' })[0].what, /"no_code_changes" task declares "automerge"/);
  assert.match(validateTaskDeclaration({ ...validTask, expected_outcome: 'push' })[0].what, /not a legal outcome ceiling/);
});

// --- validate-dispatch ---
const goodPath = '.claudinite/local/packs/gcec/tasks/create-extractor/task.md';
const caps = ({ existsPaths, declared = ['gcec'], task = validTask }) => ({
  exists: (p) => existsPaths.includes(p),
  isPackDeclared: (id) => declared.includes(id),
  loadTask: () => task,
});

test('DISPATCH_PATH_RE accepts shared/, local/, and the canon root packs/ forms — nothing else', () => {
  assert.ok(DISPATCH_PATH_RE.test('.claudinite/shared/packs/acme-pack-b/tasks/acme-task-c/task.md')); // consumer canon pack
  assert.ok(DISPATCH_PATH_RE.test(goodPath));                                                    // local pack
  assert.ok(DISPATCH_PATH_RE.test('packs/acme-pack-f/tasks/acme-task-h/task.md'));   // the CANON's own root pack
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.json')); // not task.md
  assert.ok(!DISPATCH_PATH_RE.test('src/packs/gcec/tasks/create-extractor/task.md'));            // prefix must be exactly a mount root or nothing
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.md#x')); // trailing junk
});

test('validateDispatchBody resolves pack/task from the canon root packs/ form', () => {
  const root = 'packs/acme-pack-f/tasks/acme-task-h/task.md';
  const json = root.replace('task.md', 'task.json');
  const v = validateDispatchBody(`${root}\n`, caps({ existsPaths: [root, json], declared: ['acme-pack-f'] }));
  assert.equal(v.ok, true);
  assert.equal(v.pack, 'acme-pack-f');
  assert.equal(v.task, 'acme-task-h');
});

test('validateDispatchBody accepts a well-formed dispatch and resolves model + outcome', () => {
  const json = goodPath.replace('task.md', 'task.json');
  const v = validateDispatchBody(`${goodPath}\n\nExecute the task above.`, caps({ existsPaths: [goodPath, json] }));
  assert.equal(v.ok, true);
  assert.equal(v.pack, 'gcec');
  assert.equal(v.task, 'create-extractor');
  assert.equal(v.model, 'opus');
  assert.equal(v.resolvedModel, 'opus');
  assert.equal(v.outcome, 'fresh_pr');
  assert.equal(v.automerge, 'anything');
  assert.equal(v.executionTimeout, 1800); // surfaced for the executor's best-effort bound (docs/PRINCIPLES.md)
});

test('validateDispatchBody rejects a bad first line, a missing file, an undeclared pack, and a bad declaration', () => {
  const json = goodPath.replace('task.md', 'task.json');
  // bad first line
  assert.match(validateDispatchBody('not a path\n', caps({ existsPaths: [] })).reason, /not a valid task path/);
  // task file missing at HEAD
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [] })).reason, /does not exist at HEAD/);
  // declaration sibling missing
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath] })).reason, /task\.json sibling.*missing/);
  // pack not declared
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, json], declared: [] })).reason, /not declared/);
  // declaration invalid
  assert.match(
    validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, json], task: { ...validTask, expected_outcome: 'push' } })).reason,
    /not a valid task declaration/,
  );
});

test('validateDispatchBody resolves the task.json sibling', () => {
  const json = goodPath.replace('task.md', 'task.json');
  const loaded = [];
  const withLoad = (paths) => validateDispatchBody(goodPath, {
    exists: (p) => paths.includes(p), isPackDeclared: () => true, loadTask: (p) => { loaded.push(p); return validTask; },
  });
  assert.equal(withLoad([goodPath, json]).ok, true);
  assert.deepEqual(loaded, [json]);
});

test('validateDispatchBody surfaces a parse failure of the declaration', () => {
  const json = goodPath.replace('task.md', 'task.json');
  const v = validateDispatchBody(goodPath, {
    exists: (p) => [goodPath, json].includes(p),
    isPackDeclared: () => true,
    loadTask: () => { throw new Error('SyntaxError: boom'); },
  });
  assert.match(v.reason, /did not parse: SyntaxError: boom/);
});

test('dispatchFirstLine trims and takes only the first line', () => {
  assert.equal(dispatchFirstLine(`  ${goodPath}  \nrest`), goodPath);
});

// --- verify-outcome ---
test('verifyOutcome enforces each ceiling and always allows no-change', () => {
  // no-change is always legal
  for (const outcome of OUTCOMES) assert.deepEqual(verifyOutcome({ outcome }), { ok: true, violation: null });

  // no_code_changes must not open or merge
  assert.equal(verifyOutcome({ outcome: 'no_code_changes', openedPr: true }).ok, false);
  assert.equal(verifyOutcome({ outcome: 'no_code_changes', mergedPr: true }).ok, false);

  // every outcome that opens a pull request, with nothing authorized (explicitly, or
  // by omission), may open but not merge
  for (const outcome of ['fresh_pr', 'amend_existing_or_create_new_pr', 'supersede_existing_pr']) {
    assert.equal(verifyOutcome({ outcome, openedPr: true }).ok, true, outcome);
    assert.equal(verifyOutcome({ outcome, automerge: 'nothing', mergedPr: true }).ok, false, outcome);
    assert.equal(verifyOutcome({ outcome, mergedPr: true }).ok, false, outcome);
  }

  // an authorization — full or granular — permits the merge at this seam (the
  // diff-level verdict is the policy engine's, which sees the tree)
  assert.equal(verifyOutcome({ outcome: 'fresh_pr', automerge: 'anything', mergedPr: true }).ok, true);
  assert.equal(verifyOutcome({ outcome: 'amend_existing_or_create_new_pr', automerge: ['comment-only-changes'], mergedPr: true }).ok, true);

  // a retired spelling is now an unknown ceiling, and every unknown fails closed
  for (const outcome of ['open-pr', 'merged-pr', 'none', 'pr', 'push']) {
    assert.equal(verifyOutcome({ outcome, openedPr: true }).ok, false, outcome);
  }
});



// --- the work-item queue's three optional declarations ------------------------
// All three are ADDITIVE (docs/PRINCIPLES.md): a declaration that names
// none of them stays valid, which is what lets the mechanism ship to a fleet whose
// local packs nothing migrates.

test('schedule_after / on_interrupt / invocation_endpoint are optional and validated when present', async () => {
  const { validateTaskDeclaration } = await import('../../src/contract/task-contract.mjs');
  const base = {
    id: 't', trigger: 'schedule', preconditions: ['schedule:at-most-daily'], agent_model: 'none',
    expected_outcome: 'no_code_changes',
    code_work: 'node w.mjs', code_work_timeout: 60,
  };
  assert.deepEqual(validateTaskDeclaration(base), [], 'declaring none of them is legal');
  assert.deepEqual(validateTaskDeclaration({ ...base, schedule_after: ['acme-pack-b/acme-task-c'], on_interrupt: 'needs-human', invocation_endpoint: 'fleet' }), []);
  // The retired spellings are no longer renamed at the door: a declaration carrying
  // one is missing what it meant to declare, which is what a retirement has to mean.
  const secrets = normalizeTaskDeclaration({ required_secrets: ['X'] });
  assert.equal(secrets.code_work_required_secrets, undefined);
  const renamed = normalizeTaskDeclaration({ after: ['a/b'] });
  assert.equal(renamed.schedule_after, undefined);

  const bad = (patch, re) => {
    const problems = validateTaskDeclaration({ ...base, ...patch });
    assert.equal(problems.length, 1, JSON.stringify(patch));
    assert.match(problems[0].what, re);
  };
  bad({ schedule_after: 'acme-pack-b/acme-task-c' }, /"schedule_after" is not an array/);
  bad({ schedule_after: ['acme-task-c'] }, /"schedule_after" is not an array/);   // a bare id names no pack
  bad({ on_interrupt: 'retry' }, /"on_interrupt"/);
  bad({ invocation_endpoint: 'https://example.invalid/x' }, /kebab-case endpoint name/);
});

// F17 — the constraint that has no other home: a code-work legally allowed to
// outlive the executor's claim leash is reclaimed WHILE ALIVE, and the failure is
// a livelock (every tenure reclaimed before it can finish), not one duplicate run.
test('a code_work_timeout reaching the executing leash is rejected at author time (F17)', async () => {
  const { validateTaskDeclaration } = await import('../../src/contract/task-contract.mjs');
  const { EXECUTING_LEASH_MS } = await import('../../public/task-constants.mjs');
  const base = {
    id: 't', trigger: 'schedule', preconditions: ['schedule:at-most-daily'], agent_model: 'none',
    expected_outcome: 'no_code_changes', code_work: 'node w.mjs',
  };
  const seconds = EXECUTING_LEASH_MS / 1000;
  assert.deepEqual(validateTaskDeclaration({ ...base, code_work_timeout: seconds - 1 }), []);
  const problems = validateTaskDeclaration({ ...base, code_work_timeout: seconds });
  assert.equal(problems.length, 1);
  assert.match(problems[0].what, /claim leash/);
});

// The corpus itself must satisfy that constraint — a rule proven only on fixtures
// says nothing about the tasks this repo actually ships.
test('every task this repo carries declares a code_work bound under the leash', async () => {
  const { discoverTasks } = await import('../../src/contract/discover.mjs');
  const { loadConfig } = await import('../../../../engine/checks/helpers/repo-context.mjs');
  const { EXECUTING_LEASH_MS } = await import('../../public/task-constants.mjs');
  const root = process.cwd();
  const { tasks } = await discoverTasks(root, loadConfig(root));
  assert.ok(tasks.length > 0, 'the scan must actually reach this repo\'s tasks');
  for (const t of tasks) {
    if (t.decl.code_work === undefined) continue;
    assert.ok(t.decl.code_work_timeout * 1000 < EXECUTING_LEASH_MS,
      `${t.pack}/${t.id} declares code_work_timeout ${t.decl.code_work_timeout}s`);
  }
});


// --- the retired frequency field (docs/PRINCIPLES.md) --------------------
//
// The door that read `frequency` as the cadence term it meant is closed (#1732). What
// replaces it is a rejection BY NAME: the
// field carries no cadence any more, so a declaration still holding one has to be told the
// term to write rather than quietly read as a task that never stated a cadence at all.

test('a declaration carrying the retired frequency field is rejected, naming the term to write', () => {
  const base = { ...validTask, preconditions: [] };
  const whatOf = (decl) => validateTaskDeclaration(decl).map((p) => p.what).join(' | ');
  const fixOf = (decl) => validateTaskDeclaration(decl).map((p) => p.fix).join(' | ');

  for (const f of FREQUENCIES) {
    assert.match(whatOf({ ...base, frequency: f }), /"frequency", which is retired/, f);
    // The remedy names the term the field always meant — `manual` meant no cadence at all.
    assert.match(fixOf({ ...base, frequency: f }), f === 'manual' ? /"trigger": "request"/ : new RegExp(cadenceTermFor(f)), f);
  }
  // The field carries no cadence through the door any more: what a declaration
  // states is what every reader downstream sees, field or no field.
  assert.deepEqual(normalizeTaskDeclaration({ frequency: 'weekly', preconditions: ['repo-active'] }).preconditions, ['repo-active']);
  // No field and no expression: the empty expression, so every reader judges one array.
  assert.deepEqual(normalizeTaskDeclaration({ id: 'x' }).preconditions, []);
  // No field, no rewrite: the expression is the author's.
  assert.deepEqual(normalizeTaskDeclaration({ preconditions: ['substantive-change'] }).preconditions, ['substantive-change']);
});

test('a declaration carrying an unknown frequency is reported as the illegal condition it becomes', () => {
  const decl = {
    id: 'legacy', trigger: 'schedule', frequency: 'hourly', agent_model: 'sonnet', agent_instructions: 'task.md',
    expected_outcome: 'no_code_changes', preconditions: [], agent_execution_timeout: 600,
  };
  const findings = validateTaskDeclaration(decl);
  assert.equal(findings.length, 1, 'the field is rejected by name, whatever it holds');
  assert.match(findings[0].what, /"frequency", which is retired/);
  // A value no cadence answers for cannot name a term, so the remedy names the shape.
  assert.match(findings[0].fix, /schedule:at-most-<daily\|weekly\|monthly>/);
});

// Stating no conditions is a task that REQUIRES nothing, which is a different claim
// from being off the schedule — `trigger` makes the second one, and the declaration
// below makes both at once rather than one standing in for the other (#1789).
test('a declaration with no frequency and no preconditions requires nothing, and states its own trigger', () => {
  const { frequency, preconditions, ...silent } = { ...validTask, trigger: 'request' };
  assert.deepEqual(validateTaskDeclaration(silent), []);
  assert.equal(isScheduledTask(normalizeTaskDeclaration(silent)), false);
  // …and `none` is a second spelling of that absence, which is what retires it.
  assert.match(validateTaskDeclaration({ ...silent, preconditions: ['none'] })[0].what, /"none" is retired/);
});

// Which task is ASKED is `trigger`'s answer, pinned in task-trigger.test.mjs. This
// is the other half of "when": the rate a task keeps, once it is being asked.
test('taskCadence reads the cadence term a declaration states, in either shape', () => {
  assert.deepEqual(taskCadence(normalizeTaskDeclaration({ preconditions: ['schedule:at-most-weekly'] })), { kind: 'period', cadence: 'weekly' });
  // The retired spelling reads as the same cadence, for a caller that did not come
  // through the door (calendar.mjs, DUE_TERM).
  assert.deepEqual(taskCadence({ preconditions: ['due:monthly'] }), { kind: 'period', cadence: 'monthly' });
  assert.equal(taskCadence({ preconditions: ['substantive-change'] }), null, 'no cadence term: asked every tick, runs on movement');
  assert.equal(taskCadence(normalizeTaskDeclaration({ id: 'x' })), null);
  assert.equal(taskCadence(null), null);
  assert.equal(isScheduledTask(null), false);
});
