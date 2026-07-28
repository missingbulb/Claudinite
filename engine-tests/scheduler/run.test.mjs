import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDueTaskSlots, signalsUnion, runPrecondition, renderSummary, planRun, ensureLabels, maintainDispatchIssues, parseOverrides, forcedTaskIds } from '../../engine/scheduler/run.mjs';
import { DEFAULT_SCHEDULE } from '../../engine/scheduler/slots.mjs';
import { SCHEDULER_LABELS, READY_LABEL, READY_FLEET_LABEL, AGENT_RUNNING_LABEL, NEEDS_HUMAN_LABEL } from '../../engine/scheduler/dispatch.mjs';

const D = DEFAULT_SCHEDULE;

test('ensureLabels creates every dispatch label, tolerating already-exists (422)', async () => {
  const calls = [];
  const gh = async (path, opts) => {
    calls.push({ path, method: opts?.method, name: opts?.body?.name });
    // Simulate ready-for-agent already existing (422), the rest newly created (201).
    // A PATCH (the reconcile of an existing label) carries no name and answers 200.
    if (opts?.method === 'PATCH') return { status: 200, json: null };
    return { status: opts?.body?.name === READY_LABEL ? 422 : 201, json: null };
  };
  const logs = [];
  const orig = console.log; console.log = (m) => logs.push(m);
  try {
    await ensureLabels(gh, 'o/r', SCHEDULER_LABELS);
  } finally { console.log = orig; }
  // One POST /labels per label...
  const posted = calls.filter((c) => c.method === 'POST');
  assert.equal(posted.length, SCHEDULER_LABELS.length);
  assert.ok(posted.every((p) => p.path === '/repos/o/r/labels'));
  assert.deepEqual(posted.map((p) => p.name).sort(), SCHEDULER_LABELS.map((l) => l.name).sort());
  // ...plus exactly one reconcile, for the label that already existed.
  const patched = calls.filter((c) => c.method === 'PATCH');
  assert.deepEqual(patched.map((p) => p.path), [`/repos/o/r/labels/${encodeURIComponent(READY_LABEL)}`]);
  // Neither a 201 nor a 422 is an error.
  assert.equal(logs.filter((m) => /could not (ensure|reconcile) label/.test(m)).length, 0);
});

test('ensureLabels reconciles an existing label back to spec, not just its existence', async () => {
  // 422 means the NAME is taken — it says nothing about the colour or description.
  // A label GitHub auto-created (applying an unknown name to an issue creates it
  // grey, `ededed`, with no description) would otherwise keep those defaults for
  // good: POST always 422s, so the spec never lands. That happened across seven
  // members whose `ready-for-agent` was seeded by an issue rather than the
  // scheduler. Existence is not conformance — reconcile the shape too.
  const calls = [];
  const gh = async (path, opts) => {
    calls.push({ path, method: opts?.method, body: opts?.body });
    return { status: opts?.method === 'POST' ? 422 : 200, json: null };
  };
  const logs = [];
  const orig = console.log; console.log = (m) => logs.push(m);
  try {
    await ensureLabels(gh, 'o/r', [SCHEDULER_LABELS[0]]);
  } finally { console.log = orig; }

  const spec = SCHEDULER_LABELS[0];
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch, 'a label that already exists is PATCHed back to its spec');
  assert.equal(patch.path, `/repos/o/r/labels/${encodeURIComponent(spec.name)}`);
  assert.equal(patch.body.color, spec.color);
  assert.equal(patch.body.description, spec.description);
  assert.equal(logs.filter((m) => /could not ensure label/.test(m)).length, 0);
});

test('ensureLabels does not PATCH a label it just created', async () => {
  // A 201 already carries the spec — a follow-up PATCH would be a wasted call on
  // every first run of every repo.
  const calls = [];
  const gh = async (path, opts) => {
    calls.push({ method: opts?.method });
    return { status: 201, json: null };
  };
  await ensureLabels(gh, 'o/r', [SCHEDULER_LABELS[0]]);
  assert.deepEqual(calls.map((c) => c.method), ['POST']);
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

// --- maintainDispatchIssues: the recovery the executor's sweep used to do -----
// The sweep is gone (one executor session runs exactly its own triggering issue),
// so these backstops run here, once per scheduler run, over the GitHub calls the
// shell actually makes.

// A fake gh that serves one search result set and records every write.
const maintenanceGh = (items) => {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push({ path, method: opts.method ?? 'GET', body: opts.body });
    if (path.startsWith('/search/issues')) return { status: 200, json: { items } };
    return { status: opts.method === 'POST' && path.endsWith('/labels') ? 201 : 200, json: null };
  };
  return { gh, calls };
};
const quiet = async (fn) => {
  const orig = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
};

test('maintainDispatchIssues re-arms a lost trigger by removing and re-adding its own ready label', async () => {
  const { gh, calls } = maintenanceGh([
    { number: 11, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_FLEET_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  const out = await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-22T02:00:00Z', { labelsEnsured: true }));
  assert.deepEqual(out.rearmed, [11]);

  // Remove then re-add — a bare re-apply emits no `labeled` event, so both halves
  // are load-bearing, and the label must be the fleet one the issue already had.
  const del = calls.find((c) => c.method === 'DELETE');
  assert.equal(del.path, `/repos/o/r/issues/11/labels/${encodeURIComponent(READY_FLEET_LABEL)}`);
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/11/labels');
  assert.deepEqual(add.body.labels, [READY_FLEET_LABEL]);
  assert.ok(calls.indexOf(del) < calls.indexOf(add));
});

test('maintainDispatchIssues leaves a fresh, claimed, or commented issue completely alone', async () => {
  const { gh, calls } = maintenanceGh([
    { number: 1, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:55:00Z', updated_at: '2026-07-22T01:55:00Z', comments: 0 }, // 5m old
    { number: 2, title: '[claudinite-task] p/b d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:58:00Z', comments: 1 }, // live claim
    { number: 3, title: '[claudinite-task] p/c d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:30:00Z', comments: 2 }, // engaged
  ]);
  const out = await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-22T02:00:00Z', { labelsEnsured: true }));
  assert.deepEqual(out, { stale: [], deadClaims: [], rearmed: [] });
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0); // read-only run
});

test('maintainDispatchIssues escalates a stale issue and does NOT also re-arm it', async () => {
  const { gh, calls } = maintenanceGh([
    { number: 21, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  const out = await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-25T05:00:00Z', { labelsEnsured: true })); // ~3d → past 2 daily periods
  assert.deepEqual(out.stale, [21]);
  assert.deepEqual(out.rearmed, []); // the two rules overlap here; stale has to win

  assert.ok(calls.some((c) => c.path === '/repos/o/r/issues/21/comments' && c.method === 'POST'));
  // The ready label comes off, so an escalated issue stops being armed.
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(encodeURIComponent(READY_LABEL))));
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/21/labels');
  assert.deepEqual(add.body.labels, [NEEDS_HUMAN_LABEL]);
});

test('maintainDispatchIssues reclaims a dead agent-running claim', async () => {
  const { gh, calls } = maintenanceGh([
    { number: 31, title: '[claudinite-task] p/a d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T02:00:00Z', comments: 1 },
  ]);
  const out = await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-22T12:00:00Z', { labelsEnsured: true })); // 10h idle
  assert.deepEqual(out.deadClaims, [31]);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(AGENT_RUNNING_LABEL)));
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/31/labels');
  assert.deepEqual(add.body.labels, [NEEDS_HUMAN_LABEL]);
});

test('maintainDispatchIssues ensures the labels before applying needs-human when the run has not', async () => {
  const { gh, calls } = maintenanceGh([
    { number: 41, title: '[claudinite-task] p/a d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-25T05:00:00Z', { labelsEnsured: false }));
  // GitHub 422s on applying an unknown label, so the ensure has to precede the write.
  const ensured = calls.filter((c) => c.path === '/repos/o/r/labels');
  assert.equal(ensured.length, SCHEDULER_LABELS.length);
  const firstWrite = calls.findIndex((c) => c.path.startsWith('/repos/o/r/issues/41'));
  assert.ok(calls.indexOf(ensured.at(-1)) < firstWrite);
});

test('an idle repo with no open dispatch issues writes nothing', async () => {
  const { gh, calls } = maintenanceGh([]);
  const out = await quiet(() => maintainDispatchIssues(gh, 'o/r', '2026-07-22T02:00:00Z'));
  assert.deepEqual(out, { stale: [], deadClaims: [], rearmed: [] });
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
});

// ── parseOverrides ──────────────────────────────────────────────────────────
// The workflow can only declare ONE free-form input (GitHub has no arbitrary
// named inputs), so this parser is the whole surface between a human typing in
// the Actions UI and a task's precondition.

test('parseOverrides splits KEY=value on commas and newlines, trimming both sides', () => {
  assert.deepEqual(parseOverrides('FORCE_TASKS=baselining'), { FORCE_TASKS: 'baselining' });
  assert.deepEqual(parseOverrides(' A=1 , B=2 '), { A: '1', B: '2' });
  assert.deepEqual(parseOverrides('A=1\nB=2'), { A: '1', B: '2' });
});

test('parseOverrides reads a bare key as "true", so a valueless flag still lands', () => {
  assert.deepEqual(parseOverrides('FORCE_TASKS'), { FORCE_TASKS: 'true' });
});

test('parseOverrides yields an empty bag for the scheduled-run cases, never a throw', () => {
  for (const raw of [undefined, null, '', '   ', ',,', '\n']) {
    assert.deepEqual(parseOverrides(raw), {}, `${JSON.stringify(raw)} must parse to an empty bag`);
  }
});

test('parseOverrides keeps values as strings — no truthiness coercion', () => {
  // The whole point: a task compares against the literal it documents, so
  // `FORCE_X=false` can never read as "the key is present, therefore on".
  assert.deepEqual(parseOverrides('FORCE_X=false'), { FORCE_X: 'false' });
  assert.deepEqual(parseOverrides('N=0'), { N: '0' });
  assert.equal(parseOverrides('A=b=c').A, 'b=c'); // only the FIRST = separates
});

test('parseOverrides takes what gh hands it after ITS own first-"=" split', () => {
  // `gh workflow run -f overrides=FORCE_TASKS=baselining` has TWO '=' on the
  // command line, one per parser: gh's parseField splits on the first
  // (strings.IndexRune) so the workflow input arrives as `FORCE_TASKS=baselining`,
  // and this parser then splits on ITS first. Same rule twice, which is why the
  // form works and why a value may itself contain '='.
  assert.deepEqual(parseOverrides('FORCE_TASKS=baselining'), { FORCE_TASKS: 'baselining' });
  // Several overrides ride ONE input, comma-separated — not repeated -f flags,
  // since the workflow declares exactly one input.
  assert.deepEqual(parseOverrides('FORCE_TASKS=baselining,FORCE_OTHER=x'), { FORCE_TASKS: 'baselining', FORCE_OTHER: 'x' });
});

// ── FORCE_TASKS and the SLOT gate (#515) ────────────────────────────────────
// The override's first cut only cleared the precondition gate, and every test
// drove the precondition directly — so nothing noticed that `planRun` computes
// the due list FIRST and a task whose slot has passed never reaches its
// precondition at all. These drive planRun with a deliberately non-due slot,
// which is the only shape that catches it.

// 09:05, hourly scheduler last successful at 08:44 — so today's daily-2h slot
// (02:00) has already been passed by an earlier run. Exactly the mid-day manual
// run the override exists for.
const MIDDAY = { now: '2026-07-28T09:05:00Z', lastSuccess: '2026-07-28T08:44:00Z' };
const forceable = (id) => mkTask(id, {
  frequency: 'daily-2h',
  precondition: (signals) => (String(signals.overrides?.FORCE_TASKS ?? '').split(',').map((s) => s.trim()).includes(id)
    ? { run: true, reason: 'forced' }
    : { run: false, reason: 'not due' }),
});

test('without an override a passed slot is not evaluated at all — the gate under test', async () => {
  const { evaluations } = await planRun({
    tasks: [forceable('baselining')], schedule: D, ...MIDDAY,
    collectSignals: async () => ({ overrides: {} }),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations, [], 'a passed slot yields no evaluation, so no precondition runs');
});

test('FORCE_TASKS puts a passed-slot task back in the due list, and it dispatches', async () => {
  const { evaluations } = await planRun({
    tasks: [forceable('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({ overrides: { FORCE_TASKS: 'baselining' } }),
    existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 1, 'the forced task is evaluated despite its slot having passed');
  assert.equal(evaluations[0].task, 'baselining');
  assert.equal(evaluations[0].run, true);
  assert.equal(evaluations[0].forced, true);
  assert.equal(evaluations[0].dispatch.action, 'create');
  assert.match(evaluations[0].slotId, /^d2026-07-28$/, 'it runs under its most-recent slot, not a fabricated one');
});

test('forcing is not permission — the task\'s own precondition still decides', async () => {
  const refuses = mkTask('stubborn', { frequency: 'daily-2h', precondition: () => ({ run: false, reason: 'nothing to do' }) });
  const { evaluations } = await planRun({
    tasks: [refuses], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'stubborn' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 1, 'it is evaluated...');
  assert.equal(evaluations[0].run, false, '...but it still says no');
  assert.equal(evaluations[0].dispatch, undefined);
});

test('FORCE_TASKS forces ONLY the named ids — a sibling task is untouched', async () => {
  const { evaluations } = await planRun({
    tasks: [forceable('baselining'), forceable('growth-extract')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({ overrides: { FORCE_TASKS: 'baselining' } }),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations.map((e) => e.task), ['baselining']);
});

test('an id matching no discovered task forces nothing, and never throws', async () => {
  const { evaluations } = await planRun({
    tasks: [forceable('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'no-such-task' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations, []);
});

test('a task whose slot IS due is not double-listed when also forced', async () => {
  // Same slot, forced and due at once: the due branch wins and yields one entry.
  const { evaluations } = await planRun({
    tasks: [forceable('baselining')], schedule: D,
    now: '2026-07-28T02:30:00Z', lastSuccess: '2026-07-28T01:44:00Z', // 02:00 slot IS due
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({ overrides: { FORCE_TASKS: 'baselining' } }),
    existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].forced, undefined, 'due on its own merit, not marked forced');
});

test('forcedTaskIds reads only FORCE_TASKS, trimming and dropping blanks', () => {
  assert.deepEqual(forcedTaskIds({ FORCE_TASKS: 'a, b ,,c' }), ['a', 'b', 'c']);
  assert.deepEqual(forcedTaskIds({ FORCE_TASKS: '' }), []);
  assert.deepEqual(forcedTaskIds({}), []);
  assert.deepEqual(forcedTaskIds({ FORCE_BASELINING: 'true' }), [], 'the superseded key forces nothing');
});
