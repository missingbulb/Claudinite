import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, MODEL_MAP, resolveModel, isAgentless } from '../../engine/scheduler/model-map.mjs';
import { validateTaskDeclaration, OUTCOMES, SIGNAL_NAMES } from '../../engine/scheduler/task-contract.mjs';
import { validateDispatchBody, dispatchFirstLine, DISPATCH_PATH_RE } from '../../engine/scheduler/validate-dispatch.mjs';
import { verifyOutcome } from '../../engine/scheduler/verify-outcome.mjs';

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
  frequency: 'daily-1h',
  precondition_signals: ['commits', 'prs', 'issues'],
  agent_model: 'opus',
  expected_outcome: 'merged-pr',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  precondition() { return { run: true, reason: 'x' }; },
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

test('validateTaskDeclaration requires agent_execution_timeout on an agentic task', () => {
  const { agent_execution_timeout, ...noBound } = validTask;
  assert.match(validateTaskDeclaration(noBound)[0].what, /no positive-integer "agent_execution_timeout"/);
  // a non-integer or non-positive bound is equally rejected
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 0 }).length);
  assert.ok(validateTaskDeclaration({ ...validTask, agent_execution_timeout: 12.5 }).length);
});

test('validateTaskDeclaration: an agentless (none) task needs preprocessing but no execution bound', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none' };
  delete none.agent_execution_timeout;
  // a bare none task with no preprocessing does nothing → flagged
  assert.match(validateTaskDeclaration(none)[0].what, /declares no "prework"/);
  // with preprocessing + its timeout it is clean, and needs no execution bound
  assert.deepEqual(
    validateTaskDeclaration({ ...none, prework: 'node worker.mjs', prework_timeout: 120 }),
    [],
  );
});

test('validateTaskDeclaration: agent_instructions is required for an agentic task but not applicable to none', () => {
  // a none task with NO agent_instructions at all is clean — the field is not
  // applicable when there is no agent.
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none', prework: 'node worker.mjs', prework_timeout: 120 };
  delete none.agent_execution_timeout;
  delete none.agent_instructions;
  assert.deepEqual(validateTaskDeclaration(none), []);

  // an agentic task (agent_model !== 'none') with no agent_instructions still fails.
  const { agent_instructions, ...noInstructions } = validTask;
  assert.match(validateTaskDeclaration(noInstructions)[0].what, /no string "agent_instructions"/);
});

test('validateTaskDeclaration validates prework + its required timeout and containment', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none' };
  delete none.agent_execution_timeout;
  // preprocessing without a timeout is rejected
  assert.match(
    validateTaskDeclaration({ ...none, prework: 'node prepare.mjs' })[0].what,
    /"prework_timeout" is not a positive integer/,
  );
  // a task-local command with a timeout is accepted
  assert.deepEqual(
    validateTaskDeclaration({ ...none, prework: 'node prepare.mjs', prework_timeout: 120 }),
    [],
  );
  // an absolute path or a `..` traversal is rejected
  assert.match(
    validateTaskDeclaration({ ...none, prework: 'node /usr/bin/x.mjs', prework_timeout: 120 })[0].what,
    /reaches outside the task directory/,
  );
  assert.match(
    validateTaskDeclaration({ ...none, prework: 'node ../evil.mjs', prework_timeout: 120 })[0].what,
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

test('validateTaskDeclaration flags every malformed field', () => {
  const problems = validateTaskDeclaration({
    id: '',
    frequency: 'fortnightly',
    precondition_signals: ['commits', 'bogus'],
    agent_model: 'gpt',
    expected_outcome: 'push',
    agent_instructions: 42,
    precondition: 'nope',
  });
  const whats = problems.map((p) => p.what).join(' | ');
  assert.match(whats, /no string "id"/);
  assert.match(whats, /not a legal frequency/);
  assert.match(whats, /known signal names/);
  assert.match(whats, /not a legal model family/);
  assert.match(whats, /not a legal outcome ceiling/);
  assert.match(whats, /no string "agent_instructions"/);
  assert.match(whats, /"precondition" is not a function/);
});

test('validateTaskDeclaration rejects a non-object export', () => {
  assert.match(validateTaskDeclaration(null)[0].what, /does not default-export a declaration object/);
});

test('the contract enums are exactly the DESIGN vocabulary', () => {
  assert.deepEqual(OUTCOMES, ['none', 'open-pr', 'merged-pr']);
  assert.ok(SIGNAL_NAMES.includes('fleet') && SIGNAL_NAMES.includes('sharedMount'));
});

// --- validate-dispatch ---
const goodPath = '.claudinite/local/packs/gcec/tasks/create-extractor/task.md';
const caps = ({ existsPaths, declared = ['gcec'], task = validTask }) => ({
  exists: (p) => existsPaths.includes(p),
  isPackDeclared: (id) => declared.includes(id),
  loadTask: () => task,
});

test('DISPATCH_PATH_RE accepts shared/, local/, and the canon root packs/ forms — nothing else', () => {
  assert.ok(DISPATCH_PATH_RE.test('.claudinite/shared/packs/basics/tasks/update/task.md')); // consumer canon pack
  assert.ok(DISPATCH_PATH_RE.test(goodPath));                                                    // local pack
  assert.ok(DISPATCH_PATH_RE.test('packs/grow_with_claudinite/tasks/growth-extract/task.md'));   // the CANON's own root pack
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.mjs')); // not task.md
  assert.ok(!DISPATCH_PATH_RE.test('src/packs/gcec/tasks/create-extractor/task.md'));            // prefix must be exactly a mount root or nothing
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.md#x')); // trailing junk
});

test('validateDispatchBody resolves pack/task from the canon root packs/ form', () => {
  const root = 'packs/grow_with_claudinite/tasks/growth-extract/task.md';
  const mjs = root.replace('task.md', 'task.mjs');
  const v = validateDispatchBody(`${root}\n`, caps({ existsPaths: [root, mjs], declared: ['grow_with_claudinite'] }));
  assert.equal(v.ok, true);
  assert.equal(v.pack, 'grow_with_claudinite');
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
  assert.equal(v.outcome, 'merged-pr');
  assert.equal(v.executionTimeout, 1800); // surfaced for the executor's best-effort bound (§6)
});

test('validateDispatchBody rejects a bad first line, a missing file, an undeclared pack, and a bad declaration', () => {
  const mjs = goodPath.replace('task.md', 'task.mjs');
  // bad first line
  assert.match(validateDispatchBody('not a path\n', caps({ existsPaths: [] })).reason, /not a valid task path/);
  // task file missing at HEAD
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [] })).reason, /does not exist at HEAD/);
  // task.mjs sibling missing
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath] })).reason, /task\.mjs sibling.*missing/);
  // pack not declared
  assert.match(validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, mjs], declared: [] })).reason, /not declared/);
  // task.mjs declaration invalid
  assert.match(
    validateDispatchBody(goodPath, caps({ existsPaths: [goodPath, mjs], task: { ...validTask, frequency: 'nope' } })).reason,
    /not a valid task declaration/,
  );
});

test('validateDispatchBody surfaces a parse failure of task.mjs', () => {
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

  // open-pr may open but not merge
  assert.equal(verifyOutcome({ outcome: 'open-pr', openedPr: true }).ok, true);
  assert.equal(verifyOutcome({ outcome: 'open-pr', mergedPr: true }).ok, false);

  // merged-pr may do anything within the taxonomy
  assert.equal(verifyOutcome({ outcome: 'merged-pr', mergedPr: true }).ok, true);

  // unknown ceiling fails closed
  assert.equal(verifyOutcome({ outcome: 'push', openedPr: true }).ok, false);
});

// --- the 2026-08-06 rename boundary ------------------------------------------
// Consumer local packs rename on their own clock, so the LEGACY field names must
// stay a valid way to declare prework: normalized at the door (discover,
// resolve-dispatch), canonical everywhere downstream.
test('normalizeTaskDeclaration maps legacy agent_preprocessing names to prework, canonical winning on conflict', async () => {
  const { normalizeTaskDeclaration } = await import('../../engine/scheduler/task-contract.mjs');
  const n = normalizeTaskDeclaration({ agent_preprocessing: 'node w.mjs', agent_preprocessing_timeout: 60, agent_model: 'none' });
  assert.equal(n.prework, 'node w.mjs');
  assert.equal(n.prework_timeout, 60);
  assert.equal(n.agent_preprocessing, undefined);
  assert.equal(n.agent_preprocessing_timeout, undefined);
  // Both present → canonical wins; nothing is destroyed silently elsewhere.
  assert.equal(normalizeTaskDeclaration({ prework: 'node a.mjs', agent_preprocessing: 'node b.mjs' }).prework, 'node a.mjs');
  // Non-objects pass through for validate to report.
  assert.equal(normalizeTaskDeclaration(null), null);
});

test('a legacy-named agentless declaration validates clean — the rename is not a breaking change', async () => {
  const { validateTaskDeclaration } = await import('../../engine/scheduler/task-contract.mjs');
  const problems = validateTaskDeclaration({
    id: 't', frequency: 'daily', precondition_signals: [], agent_model: 'none',
    expected_outcome: 'none', precondition: () => ({ run: true }),
    agent_preprocessing: 'node worker.mjs', agent_preprocessing_timeout: 120,
  });
  assert.deepEqual(problems, []);
});
