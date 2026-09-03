import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, MODEL_MAP, resolveModel, isAgentless } from '../model-map.mjs';
import {
  validateTaskDeclaration, normalizeTaskDeclaration, taskSignalNames, OUTCOMES, SIGNAL_NAMES,
  DEFAULT_AGENT_MODEL, DEFAULT_AGENT_EXECUTION_TIMEOUT, defaultAgentModel, DESCRIPTION_MAX_WORDS,
} from '../task-contract.mjs';
import {
  FREQUENCIES, ACCEPTED_FREQUENCIES, LEGACY_FREQUENCIES, normalizeFrequency,
} from '../calendar.mjs';
import { validateDispatchBody, dispatchFirstLine, DISPATCH_PATH_RE } from '../validate-dispatch.mjs';
import { verifyOutcome } from '../verify-outcome.mjs';

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
  id: 'growth-extract',
  frequency: 'daily',
  agent_model: 'opus',
  expected_outcome: 'pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['none'],
};

test('validateTaskDeclaration accepts a well-formed declaration', () => {
  assert.deepEqual(validateTaskDeclaration(validTask), []);
});

test('validateTaskDeclaration: session_scope is optional, defaults valid, and rejects a bad value', () => {
  assert.deepEqual(validateTaskDeclaration(validTask), []);                                  // omitted → fine (defaults to self)
  assert.deepEqual(validateTaskDeclaration({ ...validTask, session_scope: 'self' }), []);
  assert.deepEqual(validateTaskDeclaration({ ...validTask, session_scope: 'fleet' }), []);
  assert.match(validateTaskDeclaration({ ...validTask, session_scope: 'global' })[0].what, /not a legal session scope/);
});

test('validateTaskDeclaration: an agentic task\'s execution bound defaults, and a declared one must be a positive integer', () => {
  const { agent_execution_timeout, ...noBound } = validTask;
  assert.deepEqual(validateTaskDeclaration(noBound), []);
  assert.equal(normalizeTaskDeclaration(noBound).agent_execution_timeout, DEFAULT_AGENT_EXECUTION_TIMEOUT);
  // a non-integer or non-positive bound is rejected
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 0 }).length);
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 12.5 }).length);
});

test('validateTaskDeclaration: an agentless (none) task needs preprocessing but no execution bound', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none' };
  delete none.agent_execution_timeout;
  delete none.automerge;
  // a bare none task with no preprocessing does nothing → flagged
  assert.match(validateTaskDeclaration(none)[0].what, /declares no "code_work"/);
  // with preprocessing + its timeout it is clean, and needs no execution bound
  assert.deepEqual(
    validateTaskDeclaration({ ...none, code_work: 'node worker.mjs', code_work_timeout: 120 }),
    [],
  );
});

// THE AGENTIC FIELDS ARE OPTIONAL (#1633): a declaration says what is particular to
// its task, and the door fills the rest. `agent_model` derives from the shape —
// `none` for a task that declares only code_work — so the simplest agentless task
// is four fields plus its command, and the simplest agentic task is four fields.
test('normalizeTaskDeclaration fills the agentic defaults, and only where absent', () => {
  const minimalAgentic = { id: 't', frequency: 'daily', preconditions: ['none'], expected_outcome: 'none' };
  const agentic = normalizeTaskDeclaration(minimalAgentic);
  assert.equal(agentic.agent_model, DEFAULT_AGENT_MODEL);
  assert.equal(agentic.agent_instructions, 'task.md');
  assert.equal(agentic.agent_execution_timeout, DEFAULT_AGENT_EXECUTION_TIMEOUT);
  assert.deepEqual(validateTaskDeclaration(minimalAgentic), []);

  const minimalAgentless = { ...minimalAgentic, code_work: 'node w.mjs', code_work_timeout: 60 };
  const agentless = normalizeTaskDeclaration(minimalAgentless);
  assert.equal(agentless.agent_model, 'none');
  assert.equal(agentless.agent_instructions, undefined, 'no worker doc for a task that runs no agent');
  assert.deepEqual(validateTaskDeclaration(minimalAgentless), []);

  // An agentic field beside code_work makes it agentic again; a declared model is kept.
  assert.equal(normalizeTaskDeclaration({ ...minimalAgentless, agent_execution_timeout: 5 }).agent_model, DEFAULT_AGENT_MODEL);
  assert.equal(normalizeTaskDeclaration({ ...minimalAgentless, agent_model: 'opus' }).agent_model, 'opus');
  assert.equal(normalizeTaskDeclaration({ ...minimalAgentic, agent_instructions: 'spec.md' }).agent_instructions, 'spec.md');
  assert.deepEqual(defaultAgentModel({ code_work: 'x' }), 'none');
  assert.deepEqual(defaultAgentModel({}), DEFAULT_AGENT_MODEL);
  // The editor's pointer leaves at the door.
  assert.equal(normalizeTaskDeclaration({ ...minimalAgentic, $schema: 'x' }).$schema, undefined);
});

// `description` — what the task does or why it exists, in at most fifty words.
// Absent, it validates: nothing converges a member's task files, so a member's
// own declaration keeps loading; the shape check is what asks for one.
test('validateTaskDeclaration: a description is free prose up to fifty words', () => {
  assert.deepEqual(validateTaskDeclaration({ ...validTask, description: 'Folds the logs into an aggregate.' }), []);
  assert.deepEqual(validateTaskDeclaration(validTask), [], 'absent is accepted');
  assert.match(validateTaskDeclaration({ ...validTask, description: '' })[0].what, /"description" is empty/);
  assert.match(validateTaskDeclaration({ ...validTask, description: 42 })[0].what, /"description" is not a string/);
  const long = Array.from({ length: DESCRIPTION_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
  assert.match(validateTaskDeclaration({ ...validTask, description: long })[0].what, /"description" runs to 51 words/);
  assert.deepEqual(validateTaskDeclaration({ ...validTask, description: long.split(' ').slice(0, DESCRIPTION_MAX_WORDS).join(' ') }), []);
});

test('validateTaskDeclaration: agent_instructions defaults for an agentic task and is not applicable to none', () => {
  // a none task with NO agent_instructions at all is clean — the field is not
  // applicable when there is no agent.
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none', code_work: 'node worker.mjs', code_work_timeout: 120 };
  delete none.agent_execution_timeout;
  delete none.agent_instructions;
  delete none.automerge;
  assert.deepEqual(validateTaskDeclaration(none), []);

  // an agentic task (agent_model !== 'none') with no agent_instructions reads task.md.
  const { agent_instructions, ...noInstructions } = validTask;
  assert.deepEqual(validateTaskDeclaration(noInstructions), []);
  assert.equal(normalizeTaskDeclaration(noInstructions).agent_instructions, 'task.md');
  // …and one declaring a value that is not a file name fails.
  assert.match(validateTaskDeclaration({ ...validTask, agent_instructions: '' })[0].what, /"agent_instructions" that is not a file name/);
});

test('validateTaskDeclaration validates code_work + its required timeout and containment', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none' };
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
});

test('validateTaskDeclaration accepts required_secrets as a plain list of names (DESIGN §9)', () => {
  // Declarative, not a permission list: the only rule is "a list of names". Where
  // it is declared, and whether the repo has them, are deliberately NOT its business.
  assert.deepEqual(validateTaskDeclaration({ ...validTask, required_secrets: ['SOME_API_KEY'] }), []);
  assert.deepEqual(validateTaskDeclaration({ ...validTask, required_secrets: [] }), []);
  assert.deepEqual(validateTaskDeclaration(validTask), []);              // absent is fine
  // Only a shape that could not be read at all is rejected.
  assert.match(validateTaskDeclaration({ ...validTask, required_secrets: 'SOME_API_KEY' })[0].what, /not an array of secret names/);
  assert.match(validateTaskDeclaration({ ...validTask, required_secrets: [''] })[0].what, /not an array of secret names/);
});

test('validateTaskDeclaration rejects a required_secrets name GitHub refuses to create', () => {
  // GitHub reserves the `GITHUB_` prefix: the secret form answers "Secret names must
  // not start with GITHUB_", so such a name can never be configured and the task parks
  // for a secret nobody can add. The one name-shape rule that is not a fact about the
  // repo — it is a fact about the platform, knowable at author time.
  assert.match(
    validateTaskDeclaration({ ...validTask, required_secrets: ['GITHUB_OAUTH_CLIENT_SECRET'] })[0].what,
    /cannot be created/,
  );
  assert.deepEqual(validateTaskDeclaration({ ...validTask, required_secrets: ['MY_GITHUB_TOKEN'] }), []);
});

test('validateTaskDeclaration rejects a required_secrets name inside the code-work namespace', () => {
  // `CLAUDINITE_*` in a task file means the code-work contract, and `task-code-work-env`
  // reads every one it does not recognise as a variable nobody sets. A secret named into
  // that namespace is delivered perfectly well and still trips the rule, so the two
  // cannot coexist — and the collision is knowable here, where the name is chosen.
  assert.match(
    validateTaskDeclaration({ ...validTask, required_secrets: ['CLAUDINITE_DASHBOARD_CLIENT_SECRET'] })[0].what,
    /code-work namespace/,
  );
  assert.deepEqual(validateTaskDeclaration({ ...validTask, required_secrets: ['DASHBOARD_OAUTH_CLIENT_SECRET'] }), []);
});

test('validateTaskDeclaration flags every malformed field', () => {
  const problems = validateTaskDeclaration({
    id: '',
    frequency: 'fortnightly',
    agent_model: 'gpt',
    expected_outcome: 'push',
    agent_instructions: 42,
    precondition_signals: ['commits'],
  });
  const whats = problems.map((p) => p.what).join(' | ');
  assert.match(whats, /no string "id"/);
  assert.match(whats, /not a legal frequency/);
  assert.match(whats, /not a legal model family/);
  assert.match(whats, /not a legal outcome ceiling/);
  assert.match(whats, /"agent_instructions" that is not a file name/);
  assert.match(whats, /"precondition_signals" is retired/);
  assert.match(whats, /declares no "preconditions"/);
});

// ONE FORM, and the derivation that comes with it (task-preconditions DESIGN,
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
  // `none` is the EMPTY precondition, so any real condition beside it would be the
  // actual one — it is legal only as the sole entry.
  assert.match(whatOf(['none', 'substantive-change']), /legal only as the sole entry/);
  assert.match(whatOf(['substantive-change || none']), /legal only as the sole entry/);
  assert.match(whatOf([]), /not a non-empty array/);

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

test('the contract enums are exactly the DESIGN vocabulary', () => {
  assert.deepEqual(OUTCOMES, ['none', 'pr']);
  assert.ok(SIGNAL_NAMES.includes('fleet') && SIGNAL_NAMES.includes('sharedMount'));
});

// --- expected_outcome × automerge -----------------------------------------

test('normalizeTaskDeclaration maps the legacy outcome ceilings onto the outcome/policy pair', () => {
  const { automerge, ...baseTask } = validTask;
  const open = normalizeTaskDeclaration({ ...baseTask, expected_outcome: 'open-pr' });
  assert.equal(open.expected_outcome, 'pr');
  assert.equal(open.automerge, 'nothing');
  const merged = normalizeTaskDeclaration({ ...baseTask, expected_outcome: 'merged-pr' });
  assert.equal(merged.expected_outcome, 'pr');
  assert.equal(merged.automerge, 'anything');
  // An explicit policy beside a legacy spelling wins — a half-migrated declaration
  // keeps the narrower intent it states.
  const explicit = normalizeTaskDeclaration({
    ...baseTask, expected_outcome: 'merged-pr', automerge: ['doc-changes'],
  });
  assert.deepEqual(explicit.automerge, ['doc-changes']);
});

test('validateTaskDeclaration: a pr task must say what may auto-merge', () => {
  const { automerge, ...noAutomerge } = validTask;
  const { what } = validateTaskDeclaration(noAutomerge)[0];
  assert.match(what, /automerge/);
  for (const policy of ['nothing', 'anything', ['comment-only-changes', 'readme-changes'], ['anything', 'reject:js-code-changes']]) {
    assert.deepEqual(validateTaskDeclaration({ ...validTask, automerge: policy }), [], JSON.stringify(policy));
  }
});

test('validateTaskDeclaration: malformed policies and a policy on a none task are flagged', () => {
  const pr = (policy) => validateTaskDeclaration({ ...validTask, expected_outcome: 'pr', automerge: policy });
  assert.match(pr([])[0].what, /automerge/);
  assert.match(pr(['reject:js-code-changes'])[0].what, /automerge/);
  assert.match(pr('Not A Policy')[0].what, /automerge/);
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none', code_work: 'node w.mjs', code_work_timeout: 60, automerge: 'anything' };
  delete none.agent_execution_timeout;
  assert.match(validateTaskDeclaration(none)[0].what, /"none" task/);
});

// --- validate-dispatch ---
const goodPath = '.claudinite/local/packs/gcec/tasks/create-extractor/task.md';
const caps = ({ existsPaths, declared = ['gcec'], task = validTask }) => ({
  exists: (p) => existsPaths.includes(p),
  isPackDeclared: (id) => declared.includes(id),
  loadTask: () => task,
});

test('DISPATCH_PATH_RE accepts shared/, local/, and the canon root packs/ forms — nothing else', () => {
  assert.ok(DISPATCH_PATH_RE.test('.claudinite/shared/packs/claudinite-lifecycle/tasks/update/task.md')); // consumer canon pack
  assert.ok(DISPATCH_PATH_RE.test(goodPath));                                                    // local pack
  assert.ok(DISPATCH_PATH_RE.test('packs/claudinite-growth/tasks/growth-extract/task.md'));   // the CANON's own root pack
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.mjs')); // not task.md
  assert.ok(!DISPATCH_PATH_RE.test('src/packs/gcec/tasks/create-extractor/task.md'));            // prefix must be exactly a mount root or nothing
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.md#x')); // trailing junk
});

test('validateDispatchBody resolves pack/task from the canon root packs/ form', () => {
  const root = 'packs/claudinite-growth/tasks/growth-extract/task.md';
  const mjs = root.replace('task.md', 'task.mjs');
  const v = validateDispatchBody(`${root}\n`, caps({ existsPaths: [root, mjs], declared: ['claudinite-growth'] }));
  assert.equal(v.ok, true);
  assert.equal(v.pack, 'claudinite-growth');
  assert.equal(v.task, 'growth-extract');
});

test('validateDispatchBody accepts a well-formed dispatch and resolves model + outcome', () => {
  const mjs = goodPath.replace('task.md', 'task.mjs');
  const v = validateDispatchBody(`${goodPath}\n\nExecute the task above.`, caps({ existsPaths: [goodPath, mjs] }));
  assert.equal(v.ok, true);
  assert.equal(v.pack, 'gcec');
  assert.equal(v.task, 'create-extractor');
  assert.equal(v.model, 'opus');
  assert.equal(v.resolvedModel, 'opus');
  assert.equal(v.outcome, 'pr');
  assert.equal(v.automerge, 'anything');
  assert.equal(v.executionTimeout, 1800); // surfaced for the executor's best-effort bound (§6)
});

test('validateDispatchBody rejects a bad first line, a missing file, an undeclared pack, and a bad declaration', () => {
  const mjs = goodPath.replace('task.md', 'task.mjs');
  // bad first line
  assert.match(validateDispatchBody('not a path\n', caps({ existsPaths: [] })).reason, /not a valid task path/);
  // task file missing at HEAD
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [] })).reason, /does not exist at HEAD/);
  // declaration sibling missing
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath] })).reason, /task\.json sibling.*missing/);
  // pack not declared
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, mjs], declared: [] })).reason, /not declared/);
  // declaration invalid
  assert.match(
    validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, mjs], task: { ...validTask, frequency: 'nope' } })).reason,
    /not a valid task declaration/,
  );
});

// The declaration sibling is task.json; the retired task.mjs still resolves, and a
// folder carrying both is refused rather than guessed at (task-declaration.mjs).
test('validateDispatchBody resolves the task.json sibling, or the retired task.mjs, never both', () => {
  const json = goodPath.replace('task.md', 'task.json');
  const mjs = goodPath.replace('task.md', 'task.mjs');
  const loaded = [];
  const withLoad = (paths) => validateDispatchBody(goodPath, {
    exists: (p) => paths.includes(p), isPackDeclared: () => true, loadTask: (p) => { loaded.push(p); return validTask; },
  });
  assert.equal(withLoad([goodPath, json]).ok, true);
  assert.equal(withLoad([goodPath, mjs]).ok, true);
  assert.deepEqual(loaded, [json, mjs]);
  const both = withLoad([goodPath, json, mjs]);
  assert.equal(both.ok, false);
  assert.equal(both.gone, undefined, 'two declarations is malformed, not a task the repo dropped');
  assert.match(both.reason, /carries both a task\.json and a task\.mjs/);
});

test('validateDispatchBody surfaces a parse failure of the declaration', () => {
  const mjs = goodPath.replace('task.md', 'task.mjs');
  const v = validateDispatchBody(goodPath, {
    exists: (p) => [goodPath, mjs].includes(p),
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

  // none must not open or merge
  assert.equal(verifyOutcome({ outcome: 'none', openedPr: true }).ok, false);
  assert.equal(verifyOutcome({ outcome: 'none', mergedPr: true }).ok, false);

  // a pr task with nothing authorized (explicitly, or by omission) may open but not merge
  assert.equal(verifyOutcome({ outcome: 'pr', openedPr: true }).ok, true);
  assert.equal(verifyOutcome({ outcome: 'pr', automerge: 'nothing', mergedPr: true }).ok, false);
  assert.equal(verifyOutcome({ outcome: 'pr', mergedPr: true }).ok, false);

  // an authorization — full or granular — permits the merge at this seam (the
  // diff-level verdict is the policy engine's, which sees the tree)
  assert.equal(verifyOutcome({ outcome: 'pr', automerge: 'anything', mergedPr: true }).ok, true);
  assert.equal(verifyOutcome({ outcome: 'pr', automerge: ['comment-only-changes'], mergedPr: true }).ok, true);

  // the legacy spellings keep their meaning — a fielded caller passing a raw
  // declaration's value is judged, never rejected as unknown
  assert.equal(verifyOutcome({ outcome: 'open-pr', openedPr: true }).ok, true);
  assert.equal(verifyOutcome({ outcome: 'open-pr', mergedPr: true }).ok, false);
  assert.equal(verifyOutcome({ outcome: 'merged-pr', mergedPr: true }).ok, true);

  // unknown ceiling fails closed
  assert.equal(verifyOutcome({ outcome: 'push', openedPr: true }).ok, false);
});

// --- the 2026-08-06 rename boundary ------------------------------------------
// Consumer local packs rename on their own clock, so the LEGACY field names must
// stay a valid way to declare code_work: normalized at the door (discover,
// resolve-dispatch), canonical everywhere downstream.
test('normalizeTaskDeclaration maps legacy agent_preprocessing names to code_work, canonical winning on conflict', async () => {
  const { normalizeTaskDeclaration } = await import('../task-contract.mjs');
  const n = normalizeTaskDeclaration({ agent_preprocessing: 'node w.mjs', agent_preprocessing_timeout: 60, agent_model: 'none' });
  assert.equal(n.code_work, 'node w.mjs');
  assert.equal(n.code_work_timeout, 60);
  assert.equal(n.agent_preprocessing, undefined);
  assert.equal(n.agent_preprocessing_timeout, undefined);
  // Both present → canonical wins; nothing is destroyed silently elsewhere.
  assert.equal(normalizeTaskDeclaration({ code_work: 'node a.mjs', agent_preprocessing: 'node b.mjs' }).code_work, 'node a.mjs');
  // Non-objects pass through for validate to report.
  assert.equal(normalizeTaskDeclaration(null), null);
});

test('a legacy-named agentless declaration validates clean — the rename is not a breaking change', async () => {
  const { validateTaskDeclaration } = await import('../task-contract.mjs');
  const problems = validateTaskDeclaration({
    id: 't', frequency: 'daily', preconditions: ['none'], agent_model: 'none',
    expected_outcome: 'none',
    agent_preprocessing: 'node worker.mjs', agent_preprocessing_timeout: 120,
  });
  assert.deepEqual(problems, []);
});

// --- the work-item queue's three optional declarations ------------------------
// All three are ADDITIVE (tasks-dispatch DESIGN §14): a declaration that names
// none of them stays valid, which is what lets the mechanism ship to a fleet whose
// local packs nothing migrates.

test('schedule_after / on_interrupt / invocation_endpoint are optional and validated when present', async () => {
  const { validateTaskDeclaration } = await import('../task-contract.mjs');
  const base = {
    id: 't', frequency: 'daily', preconditions: ['none'], agent_model: 'none',
    expected_outcome: 'none',
    code_work: 'node w.mjs', code_work_timeout: 60,
  };
  assert.deepEqual(validateTaskDeclaration(base), [], 'declaring none of them is legal');
  assert.deepEqual(validateTaskDeclaration({ ...base, schedule_after: ['claudinite-lifecycle/update'], on_interrupt: 'needs-human', invocation_endpoint: 'fleet' }), []);
  // The legacy spelling still validates — the door renames it at load, so a member's own task
  // file keeps its ordering rather than silently losing it.
  assert.deepEqual(validateTaskDeclaration({ ...base, after: ['claudinite-lifecycle/update'] }), []);
  const renamed = normalizeTaskDeclaration({ after: ['a/b'] });
  assert.deepEqual(renamed.schedule_after, ['a/b']);
  assert.equal(renamed.after, undefined);

  const bad = (patch, re) => {
    const problems = validateTaskDeclaration({ ...base, ...patch });
    assert.equal(problems.length, 1, JSON.stringify(patch));
    assert.match(problems[0].what, re);
  };
  bad({ schedule_after: 'claudinite-lifecycle/update' }, /"schedule_after" is not an array/);
  bad({ schedule_after: ['update'] }, /"schedule_after" is not an array/);   // a bare id names no pack
  bad({ after: ['update'] }, /"schedule_after" is not an array/);            // reported post-rename
  bad({ on_interrupt: 'retry' }, /"on_interrupt"/);
  bad({ invocation_endpoint: 'https://example.invalid/x' }, /kebab-case endpoint name/);
});

// F17 — the constraint that has no other home: a code-work legally allowed to
// outlive the executor's claim leash is reclaimed WHILE ALIVE, and the failure is
// a livelock (every tenure reclaimed before it can finish), not one duplicate run.
test('a code_work_timeout reaching the executing leash is rejected at author time (F17)', async () => {
  const { validateTaskDeclaration } = await import('../task-contract.mjs');
  const { EXECUTING_LEASH_MS } = await import('../queue/leases.mjs');
  const base = {
    id: 't', frequency: 'daily', preconditions: ['none'], agent_model: 'none',
    expected_outcome: 'none', code_work: 'node w.mjs',
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
  const { discoverTasks } = await import('../discover.mjs');
  const { loadConfig } = await import('../../../engine/checks/helpers/repo-context.mjs');
  const { EXECUTING_LEASH_MS } = await import('../queue/leases.mjs');
  const root = process.cwd();
  const { tasks } = await discoverTasks(root, loadConfig(root));
  assert.ok(tasks.length > 0, 'the scan must actually reach this repo\'s tasks');
  for (const t of tasks) {
    if (t.decl.code_work === undefined) continue;
    assert.ok(t.decl.code_work_timeout * 1000 < EXECUTING_LEASH_MS,
      `${t.pack}/${t.id} declares code_work_timeout ${t.decl.code_work_timeout}s`);
  }
});


// --- the frequency door (tasks-dispatch DESIGN §17.1) -------------------------
//
// A task declaration is member-owned data that no vendoring pass rewrites, so a member can carry
// a retired spelling indefinitely. It is normalized where the declaration LOADS — once, here —
// rather than at each place a frequency is read, because more than the calendar reads one.

test('the retired frequency spellings are accepted, and normalized at the door', () => {
  for (const legacy of Object.keys(LEGACY_FREQUENCIES)) {
    assert.equal(normalizeTaskDeclaration({ frequency: legacy }).frequency, 'daily',
      `${legacy} reads as daily`);
    assert.ok(ACCEPTED_FREQUENCIES.includes(legacy), `${legacy} still validates`);
    assert.ok(!FREQUENCIES.includes(legacy), `${legacy} is not writable in a NEW declaration`);
  }
  // A canonical token passes through untouched, and the door is total.
  for (const f of FREQUENCIES) assert.equal(normalizeTaskDeclaration({ frequency: f }).frequency, f);
  assert.equal(normalizeTaskDeclaration({}).frequency, undefined);
  assert.equal(normalizeFrequency('nonsense'), 'nonsense', 'an unknown token is left for the validator');
});

// THE RUNTIME TOLERANCE IS RETIRED (#1234). It accepted a retired spelling forever because a
// member's task file is its own data that no vendoring pass rewrites — so it could only come out
// once the fleet's own declarations had been read and none named one. GoogleCalendarEventCreator's
// `create-extractor` was the last, and moved to `daily`. `LEGACY_FREQUENCIES` is emptied rather
// than deleted, so a future retirement refills it and this test inverts again.
test('a declaration carrying a retired spelling no longer validates', () => {
  const decl = {
    id: 'legacy', frequency: 'hourly', agent_model: 'sonnet', agent_instructions: 'task.md',
    expected_outcome: 'none', preconditions: ['none'], agent_execution_timeout: 600,
  };
  const findings = validateTaskDeclaration(decl);
  assert.equal(findings.length, 1, 'the dead vocabulary is no longer accepted at the door');
  assert.match(findings[0].what, /"frequency" "hourly" is not a legal frequency/);
});
