import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-declaration-shape.mjs';

const goodTask = `export default {
  id: 'growth-extract',
  frequency: 'daily',
  agent_model: 'opus',
  expected_outcome: 'pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['substantive-change'],
};
`;
const TASK = '.claudinite/local/packs/mypack/tasks/growth-extract/task.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-declaration-shape: a well-formed task.mjs yields no findings', () => {
  assert.deepEqual(run({ [TASK]: goodTask }), []);
});

test('task-declaration-shape: is inert when no task.mjs exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('task-declaration-shape: flags illegal enum values', () => {
  const bad = goodTask
    .replace("frequency: 'daily'", "frequency: 'nightly'")
    .replace("agent_model: 'opus'", "agent_model: 'gpt'")
    .replace("expected_outcome: 'pr'", "expected_outcome: 'push'");
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /"frequency" is "nightly", not a legal value/);
  assert.match(whats, /"agent_model" is "gpt", not a legal value/);
  assert.match(whats, /"expected_outcome" is "push", not a legal value/);
});

// The strict half of the frequency door (tasks-dispatch DESIGN §17.1). The RUNTIME accepts a
// retired spelling forever, because a member's task file is its own data and no vendoring pass
// rewrites it — so the only thing standing between the corpus and a new declaration on the dead
// vocabulary is this author-time check, which runs in the canon.
test('task-declaration-shape: the retired frequency spellings cannot be written anew', () => {
  for (const retired of ['hourly', 'daily-2h', 'daily-1h', 'daily+1h']) {
    const bad = goodTask.replace("frequency: 'daily'", `frequency: '${retired}'`);
    const findings = run({ [TASK]: bad });
    const whats = findings.map((f) => f.what).join(' | ');
    assert.match(whats, new RegExp(`"frequency" is "${retired.replace('+', '\\+')}", not a legal value`),
      `${retired} is rejected at author time`);
    assert.ok(findings.some((f) => f.severity === 'blocking'), `${retired} blocks, not advises`);
    // …and the remedy names only the surviving vocabulary.
    assert.match(findings.find((f) => f.what.includes('frequency')).fix, /use one of: daily, weekly, monthly, manual/);
  }
});

// The ordering field's rename. ADVISORY, not blocking: the runtime normalizes `after` at the
// door forever, so a member's own task file keeps its ordering and its CI must not go red over a
// declaration nobody has edited. The finding is what drives the fleet to the canonical spelling.
test('task-declaration-shape: the legacy `after` ordering field is an advisory rename', () => {
  const legacy = goodTask.replace("  frequency: 'daily',",
    "  frequency: 'daily',\n  after: ['claudinite-lifecycle/update'],");
  const f = run({ [TASK]: legacy });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'advisory', 'never blocking — the runtime still honours it');
  assert.match(f[0].what, /legacy name "after"/);
  assert.match(f[0].fix, /rename "after" to "schedule_after"/);
});

// The outcome-ceiling rename boundary: a member's file still declaring the
// one-word ceilings keeps validating (the runtime normalizes them), and earns
// exactly one advisory naming the ceiling/policy pair to write instead.
test('task-declaration-shape: the legacy outcome ceilings are an advisory rename', () => {
  for (const [legacy, policy] of [['open-pr', 'nothing'], ['merged-pr', 'anything']]) {
    const old = goodTask
      .replace("expected_outcome: 'pr',\n  automerge: 'anything',", `expected_outcome: '${legacy}',`);
    const f = run({ [TASK]: old });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].severity, 'advisory', `${legacy} never blocks`);
    assert.match(f[0].what, new RegExp(`legacy outcome ceiling "${legacy}"`));
    assert.match(f[0].fix, new RegExp(`automerge: '${policy}'`));
  }
});

test('task-declaration-shape: a pr task without automerge, and a none task with one, block', () => {
  const missing = goodTask.replace("  automerge: 'anything',\n", '');
  assert.match(run({ [TASK]: missing }).map((f) => f.what).join(' | '), /declares no "automerge"/);

  const noneWithPolicy = goodTask
    .replace("expected_outcome: 'pr'", "expected_outcome: 'none'")
    .replace("agent_model: 'opus'", "agent_model: 'none'")
    .replace("  agent_execution_timeout: 1800,\n", "  code_work: 'node w.mjs',\n  code_work_timeout: 60,\n");
  assert.match(run({ [TASK]: noneWithPolicy }).map((f) => f.what).join(' | '), /a "none" task declares "automerge"/);
});

test('task-declaration-shape: a comment naming automerge is not a declaration of it', () => {
  const commented = goodTask
    .replace("expected_outcome: 'pr',\n  automerge: 'anything',",
      "expected_outcome: 'none', // not automerge: material")
    .replace("agent_model: 'opus'", "agent_model: 'none'")
    .replace("  agent_execution_timeout: 1800,\n", "  code_work: 'node w.mjs',\n  code_work_timeout: 60,\n");
  assert.deepEqual(run({ [TASK]: commented }), []);
});

test('task-declaration-shape: the canonical `schedule_after` is clean', () => {
  const canonical = goodTask.replace("  frequency: 'daily',",
    "  frequency: 'daily',\n  schedule_after: ['claudinite-lifecycle/update'],");
  assert.deepEqual(run({ [TASK]: canonical }), [],
    'the canonical spelling must not match the legacy pattern on its own tail');
});

test('task-declaration-shape: flags missing required fields', () => {
  const bad = `export default {
  frequency: 'daily',
  agent_model: 'sonnet',
  expected_outcome: 'none',
};
`;
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /declares no string "id"/);
  assert.match(whats, /declares no string "agent_instructions"/);
  assert.match(whats, /declares no "preconditions"/);
});

// --- the declarative expression, read statically ------------------------------
// An expression is TEXT, where a function body is opaque — which is the whole
// reason the check can rule on unknown terms and bad arguments at author time.

const declarativeTask = goodTask
  .replace("  preconditions: ['substantive-change'],\n", '')
  .replace("  frequency: 'daily',", "  frequency: 'daily',\n  preconditions: ['substantive-change', 'no-open-pr-titled:My sweep'],");

test('task-declaration-shape: a declarative task.mjs yields no findings', () => {
  assert.deepEqual(run({ [TASK]: declarativeTask }), []);
});

test('task-declaration-shape: the expression is judged term by term', () => {
  const whatsFor = (expression) => run({
    [TASK]: declarativeTask.replace(/preconditions: \[[^\]]*\]/, `preconditions: [${expression}]`),
  }).map((f) => f.what).join(' | ');

  assert.match(whatsFor("'no-such-thing'"), /unknown condition "no-such-thing"/);
  assert.match(whatsFor("'commits-under'"), /takes an inline argument and was given none/);
  assert.match(whatsFor("'substantive-change:oops'"), /takes no argument/);
  assert.match(whatsFor("'none', 'substantive-change'"), /legal only as the sole entry/);
  assert.match(whatsFor("'substantive-change ||'"), /alternative around "\|\|" is empty/);
  // A computed trigger is unreadable to a reader and to this check alike.
  assert.match(whatsFor('SOME_CONSTANT'), /not a literal list of condition strings/);
});

test('task-declaration-shape: a task-local term resolves from the preconditions.mjs beside it', () => {
  const TERMS = TASK.replace('task.mjs', 'preconditions.mjs');
  const withOwnTerm = declarativeTask.replace(/preconditions: \[[^\]]*\]/, "preconditions: ['my-own-gate']");

  // Without the sibling, the condition is a typo as far as anyone can tell.
  assert.match(run({ [TASK]: withOwnTerm }).map((f) => f.what).join(' | '), /unknown condition "my-own-gate"/);

  assert.deepEqual(run({
    [TASK]: withOwnTerm,
    [TERMS]: "export const terms = {\n  'my-own-gate': { signals: ['stamp'], holds: () => ({ holds: true }) },\n};\n",
  }), []);
});

// BOTH RETIRED SPELLINGS ARE FLAGGED BY NAME (#1617). A declaration carrying one
// is told what replaced it, rather than reading as a task that simply forgot its
// gate — which is what a bare "unknown field" would have said.
test('task-declaration-shape: the retired precondition spellings are named, not merely unrecognised', () => {
  const withFunction = declarativeTask.replace("  agent_model: 'opus',",
    "  precondition(signals) { return { run: true }; },\n  agent_model: 'opus',");
  assert.match(run({ [TASK]: withFunction }).map((f) => f.what).join(' | '),
    /declares a "precondition" function, which is retired/);

  const withSignals = declarativeTask.replace("  agent_model: 'opus',",
    "  precondition_signals: ['commits'],\n  agent_model: 'opus',");
  assert.match(run({ [TASK]: withSignals }).map((f) => f.what).join(' | '),
    /declares "precondition_signals", which is retired/);

  // A task with the retired function and nothing else is missing its gate too —
  // both findings, so the fix is unambiguous.
  const onlyFunction = declarativeTask
    .replace(/  preconditions: \[[^\]]*\],\n/, '')
    .replace("  agent_model: 'opus',", "  precondition(signals) { return { run: true }; },\n  agent_model: 'opus',");
  const whats = run({ [TASK]: onlyFunction }).map((f) => f.what).join(' | ');
  assert.match(whats, /which is retired/);
  assert.match(whats, /declares no "preconditions"/);
});

test('task-declaration-shape: flags a non-object export', () => {
  const f = run({ [TASK]: 'export default 42;\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not default-export a declaration object/);
});

test('task-declaration-shape: flags an agentic task with no agent_execution_timeout', () => {
  const bad = goodTask.replace('  agent_execution_timeout: 1800,\n', '');
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /no numeric "agent_execution_timeout"/);
});

test('task-declaration-shape: a none task needs no execution bound but flags preprocessing without a timeout', () => {
  const noneTask = `export default {
  id: 'store-release',
  frequency: 'daily',
  preconditions: ['none'],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
};
`;
  const whats = run({ [TASK]: noneTask }).map((f) => f.what).join(' | ');
  assert.doesNotMatch(whats, /agent_execution_timeout/);        // none = no agent, no bound needed
  assert.match(whats, /no numeric "code_work_timeout"/);
});

test('task-declaration-shape: flags an agentless (none) task that declares no preprocessing', () => {
  const bareNone = `export default {
  id: 'x',
  frequency: 'daily',
  preconditions: ['none'],
  agent_model: 'none',
  expected_outcome: 'none',
};
`;
  const whats = run({ [TASK]: bareNone }).map((f) => f.what).join(' | ');
  assert.match(whats, /declares no "code_work"/);
});

test('task-declaration-shape: a none task with no agent_instructions is clean — the field is not applicable', () => {
  const noneTask = `export default {
  id: 'store-release',
  frequency: 'daily',
  preconditions: ['none'],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  code_work_timeout: 120,
};
`;
  assert.deepEqual(run({ [TASK]: noneTask }), []);
});

test('task-declaration-shape: flags a preprocessing command that escapes the task directory', () => {
  const bad = goodTask.replace(
    '  agent_execution_timeout: 1800,\n',
    "  agent_execution_timeout: 1800,\n  code_work: 'node ../evil.mjs',\n  code_work_timeout: 120,\n",
  );
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /reaches outside the task directory/);
});

test('task-declaration-shape: a well-formed task with preprocessing + both timeouts is clean', () => {
  const withPrep = goodTask.replace(
    '  agent_execution_timeout: 1800,\n',
    "  agent_execution_timeout: 1800,\n  code_work: 'node prepare.mjs',\n  code_work_timeout: 300,\n",
  );
  assert.deepEqual(run({ [TASK]: withPrep }), []);
});

// The 2026-08-06 rename boundary: a member's local pack still declaring the
// legacy code-work names must keep working — the loader normalizes them — and the
// vendor refresh must not turn its CI red over files nothing has renamed yet.
// So the legacy declaration is contract-complete (no missing-code-work, no
// missing-timeout findings) and earns exactly one ADVISORY rename nudge.
test('task-declaration-shape: legacy agent_preprocessing names satisfy the contract, advisory rename only', () => {
  const legacy = goodTask
    .replace("agent_model: 'opus'", "agent_model: 'none'")
    .replace("agent_instructions: 'task.md',\n", '')
    .replace("agent_execution_timeout: 1800,", "agent_preprocessing: 'node worker.mjs',\n  agent_preprocessing_timeout: 120,");
  const findings = run({ [TASK]: legacy });
  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].severity, 'advisory');
  assert.match(findings[0].what, /legacy name/);
  assert.match(findings[0].fix, /"agent_preprocessing" → "code_work"/);
});

// A relocation leaves the old path behind as a re-export so a fielded caller still
// resolves. That file declares nothing of its own — judging it would fail the task on
// text it does not carry, while the real declaration is scanned where it now lives.
test('task-declaration-shape: a legacy-path re-export shim is not a declaration to judge', () => {
  const shim = '.claudinite/local/packs/oldpack/tasks/growth-extract/task.mjs';
  assert.deepEqual(run({
    [TASK]: goodTask,
    [shim]: "// A legacy-path shim.\nimport './legacy-entry.mjs';\nexport * from '../../../mypack/tasks/growth-extract/task.mjs';\nexport { default } from '../../../mypack/tasks/growth-extract/task.mjs';\n",
  }), []);
});

// …and an empty file is not a shim: nothing re-exports, so the missing declaration is real.
test('task-declaration-shape: an empty task.mjs is still flagged', () => {
  const findings = run({ [TASK]: '// nothing here\n' });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /does not default-export a declaration object/);
});
