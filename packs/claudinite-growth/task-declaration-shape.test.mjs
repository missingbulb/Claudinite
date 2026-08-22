import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule from '../../packs/claudinite-growth/task-declaration-shape.mjs';

const goodTask = `export default {
  id: 'growth-extract',
  frequency: 'daily',
  precondition_signals: ['commits', 'prs'],
  agent_model: 'opus',
  expected_outcome: 'merged-pr',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  precondition(signals, config) { return { run: false }; },
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
    .replace("expected_outcome: 'merged-pr'", "expected_outcome: 'push'");
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
  assert.match(whats, /declares no "precondition_signals" array/);
  assert.match(whats, /declares no "precondition" function/);
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
  precondition_signals: ['release'],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  precondition() { return { run: false }; },
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
  precondition_signals: ['release'],
  agent_model: 'none',
  expected_outcome: 'none',
  precondition() { return { run: false }; },
};
`;
  const whats = run({ [TASK]: bareNone }).map((f) => f.what).join(' | ');
  assert.match(whats, /declares no "code_work"/);
});

test('task-declaration-shape: a none task with no agent_instructions is clean — the field is not applicable', () => {
  const noneTask = `export default {
  id: 'store-release',
  frequency: 'daily',
  precondition_signals: ['release'],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  code_work_timeout: 120,
  precondition() { return { run: false }; },
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
