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
  assert.match(validateTaskDeclaration(none)[0].what, /declares no "agent_preprocessing"/);
  // with preprocessing + its timeout it is clean, and needs no execution bound
  assert.deepEqual(
    validateTaskDeclaration({ ...none, agent_preprocessing: 'node worker.mjs', agent_preprocessing_timeout: 120 }),
    [],
  );
});

test('validateTaskDeclaration validates agent_preprocessing + its required timeout and containment', () => {
  const none = { ...validTask, agent_model: 'none', expected_outcome: 'none' };
  delete none.agent_execution_timeout;
  // preprocessing without a timeout is rejected
  assert.match(
    validateTaskDeclaration({ ...none, agent_preprocessing: 'node prepare.mjs' })[0].what,
    /"agent_preprocessing_timeout" is not a positive integer/,
  );
  // a task-local command with a timeout is accepted
  assert.deepEqual(
    validateTaskDeclaration({ ...none, agent_preprocessing: 'node prepare.mjs', agent_preprocessing_timeout: 120 }),
    [],
  );
  // an absolute path or a `..` traversal is rejected
  assert.match(
    validateTaskDeclaration({ ...none, agent_preprocessing: 'node /usr/bin/x.mjs', agent_preprocessing_timeout: 120 })[0].what,
    /reaches outside the task directory/,
  );
  assert.match(
    validateTaskDeclaration({ ...none, agent_preprocessing: 'node ../evil.mjs', agent_preprocessing_timeout: 120 })[0].what,
    /reaches outside the task directory/,
  );
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

test('DISPATCH_PATH_RE accepts shared/ and local/ task paths and nothing else', () => {
  assert.ok(DISPATCH_PATH_RE.test('.claudinite/shared/packs/basics/tasks/baselining/task.md'));
  assert.ok(DISPATCH_PATH_RE.test(goodPath));
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.mjs'));
  assert.ok(!DISPATCH_PATH_RE.test('packs/gcec/tasks/create-extractor/task.md'));
  assert.ok(!DISPATCH_PATH_RE.test('.claudinite/local/packs/gcec/tasks/create-extractor/task.md#x'));
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
