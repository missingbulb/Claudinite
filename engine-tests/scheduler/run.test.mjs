import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDueTaskSlots, signalsUnion, runPrecondition, renderSummary, planRun, ensureLabels } from '../../engine/scheduler/run.mjs';
import { DEFAULT_SCHEDULE } from '../../engine/scheduler/slots.mjs';
import { SCHEDULER_LABELS, READY_LABEL } from '../../engine/scheduler/dispatch.mjs';

const D = DEFAULT_SCHEDULE;

test('ensureLabels creates every dispatch label, tolerating already-exists (422)', async () => {
  const posted = [];
  const gh = async (path, opts) => {
    posted.push({ path, method: opts?.method, name: opts?.body?.name });
    // Simulate ready-for-agent already existing (422), the rest newly created (201).
    return { status: opts?.body?.name === READY_LABEL ? 422 : 201, json: null };
  };
  const logs = [];
  const orig = console.log; console.log = (m) => logs.push(m);
  try {
    await ensureLabels(gh, 'o/r', SCHEDULER_LABELS);
  } finally { console.log = orig; }
  // One POST /labels per label, and no error logged for a 201 or a 422.
  assert.equal(posted.length, SCHEDULER_LABELS.length);
  assert.ok(posted.every((p) => p.path === '/repos/o/r/labels' && p.method === 'POST'));
  assert.deepEqual(posted.map((p) => p.name).sort(), SCHEDULER_LABELS.map((l) => l.name).sort());
  assert.equal(logs.filter((m) => /could not ensure label/.test(m)).length, 0);
});

test('ensureLabels surfaces a genuine failure (not 201/422) without throwing', async () => {
  const gh = async () => ({ status: 500, json: null });
  const logs = [];
  const orig = console.log; console.log = (m) => logs.push(m);
  try {
    await ensureLabels(gh, 'o/r', [SCHEDULER_LABELS[0]]);
  } finally { console.log = orig; }
  assert.equal(logs.filter((m) => /could not ensure label/.test(m)).length, 1);
});
const mkTask = (id, over = {}) => ({
  pack: 'p', id,
  decl: {
    id, frequency: 'daily', precondition_signals: ['commits'], agent_model: 'sonnet', expected_outcome: 'open-pr', agent_instructions: 'task.md',
    precondition: () => ({ run: true, reason: 'ok' }),
    ...over,
  },
});

test('computeDueTaskSlots pairs only due-frequency tasks with their slot', () => {
  const tasks = [mkTask('a', { frequency: 'daily' }), mkTask('b', { frequency: 'weekly' })];
  // A morning run after yesterday's success: daily is due, weekly (Sun) is not (mid-week).
  const due = computeDueTaskSlots(tasks, D, '2026-07-22T06:00:00Z', '2026-07-21T06:00:00Z');
  assert.deepEqual(due.map((d) => d.task.id), ['a']);
  assert.equal(due[0].slotId, 'd2026-07-22');
});

test('signalsUnion collects only the union of the due tasks\' declared signals', () => {
  const due = [
    { task: mkTask('a', { precondition_signals: ['commits', 'prs'] }) },
    { task: mkTask('b', { precondition_signals: ['prs', 'issues'] }) },
  ];
  assert.deepEqual(signalsUnion(due).sort(), ['commits', 'issues', 'prs']);
});

test('runPrecondition isolates a throwing precondition into a skip with the error', () => {
  const good = runPrecondition(mkTask('a'), {}, {});
  assert.deepEqual(good, { run: true, reason: 'ok', context: [] });
  const bad = runPrecondition(mkTask('b', { precondition: () => { throw new Error('boom'); } }), {}, {});
  assert.equal(bad.run, false);
  assert.match(bad.reason, /precondition threw: boom/);
  assert.equal(bad.error, 'boom');
});

test('planRun dispatches a running agent task and skips a non-running one', async () => {
  const tasks = [
    mkTask('runs', { precondition: () => ({ run: true, reason: 'work found', context: ['scope line'] }) }),
    mkTask('quiet', { precondition: () => ({ run: false, reason: 'nothing to do' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  const byTask = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  assert.equal(byTask.runs.run, true);
  assert.equal(byTask.runs.dispatch.action, 'create');
  assert.deepEqual(byTask.runs.context, ['scope line']);
  assert.equal(byTask.quiet.run, false);
  assert.equal(byTask.quiet.dispatch, undefined);
});

test('planRun marks a agent_model:none task inline instead of dispatching an issue', async () => {
  const tasks = [mkTask('code', { agent_model: 'none', expected_outcome: 'none', precondition: () => ({ run: true, reason: 'deployable change' }) })];
  let askedIssues = false;
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => { askedIssues = true; return []; },
  });
  assert.equal(evaluations[0].inline, true);
  assert.equal(evaluations[0].dispatch, undefined);
  assert.equal(askedIssues, false, 'an inline task never searches for a dispatch issue');
});

test('planRun flags a task that declares agent_preprocessing (agentless and agentful)', async () => {
  const tasks = [
    mkTask('code', { agent_model: 'none', expected_outcome: 'none', agent_preprocessing: 'node worker.mjs', agent_preprocessing_timeout: 120, precondition: () => ({ run: true, reason: 'x' }) }),
    mkTask('prep-then-agent', { agent_preprocessing: 'node prepare.mjs', agent_preprocessing_timeout: 120, precondition: () => ({ run: true, reason: 'x' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  const byTask = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  // agentless + preprocessing: both flags set; the CLI runs the subprocess, not the in-process worker.
  assert.equal(byTask.code.preprocessing, true);
  assert.equal(byTask.code.inline, true);
  // agentful + preprocessing: preprocessing flagged, and a dispatch is still planned for the hand-off.
  assert.equal(byTask['prep-then-agent'].preprocessing, true);
  assert.equal(byTask['prep-then-agent'].dispatch.action, 'create');
});

test('planRun collects the declared signal union exactly once and passes it to preconditions', async () => {
  let collectedWith = null;
  const seen = [];
  const tasks = [
    mkTask('a', { precondition_signals: ['commits'], precondition: (s) => { seen.push(s); return { run: false, reason: '' }; } }),
    mkTask('b', { precondition_signals: ['prs'], precondition: (s) => { seen.push(s); return { run: false, reason: '' }; } }),
  ];
  await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async (names) => { collectedWith = names; return { collected: names }; },
  });
  assert.deepEqual(collectedWith.sort(), ['commits', 'prs']);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], { collected: collectedWith }); // same bundle to every precondition
});

test('renderSummary lists each evaluated task with its verb and reason', () => {
  const summary = renderSummary([
    { pack: 'p', task: 'a', slotId: 'd2026-07-22', run: true, dispatch: { action: 'create', reason: 'new' } },
    { pack: 'p', task: 'b', slotId: 'd2026-07-22', run: false, reason: 'quiet' },
    { pack: 'p', task: 'c', slotId: 'd2026-07-22', run: true, inline: true, reason: 'inline work' },
  ]);
  assert.match(summary, /- p\/a \[d2026-07-22\] create — new/);
  assert.match(summary, /- p\/b \[d2026-07-22\] skip — quiet/);
  assert.match(summary, /- p\/c \[d2026-07-22\] run-inline — inline work/);
});
