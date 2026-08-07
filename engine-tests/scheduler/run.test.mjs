import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDueTaskSlots, signalsUnion, runPrecondition, renderSummary, planRun, ensureLabels, parseOverrides, forcedTaskIds } from '../../engine/scheduler/run.mjs';
import { DEFAULT_SCHEDULE } from '../../engine/scheduler/slots.mjs';
import { SCHEDULER_LABELS, READY_LABEL } from '../../engine/scheduler/dispatch.mjs';

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
  assert.deepEqual(good, { run: true, exclusive: false, reason: 'ok', context: [] });
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

// ── The exclusive claim: one task takes the whole run (#619) ────────────────
// The hourly cron is not hourly — GitHub drops and delays scheduled fires — so a
// late run finds every daily slot due at once and dispatches the whole nightly
// chain together, beside the task that was anchored an hour ahead of it to repair
// the ground the others run on. A precondition returning `exclusive: true` takes
// the cycle; everything else defers.

test('planRun defers every other running task when one claims the run exclusively', async () => {
  const tasks = [
    mkTask('claimer', { precondition: () => ({ run: true, exclusive: true, reason: 'overdue' }) }),
    mkTask('other', { precondition: () => ({ run: true, reason: 'work found' }) }),
    mkTask('agentless', { agent_model: 'none', expected_outcome: 'none', prework: 'node w.mjs', prework_timeout: 60, precondition: () => ({ run: true, reason: 'work found' }) }),
    mkTask('quiet', { precondition: () => ({ run: false, reason: 'nothing to do' }) }),
  ];
  const searched = [];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}),
    existingIssuesFor: async (pack, task) => { searched.push(task); return []; },
  });
  const by = Object.fromEntries(evaluations.map((e) => [e.task, e]));

  // The claimant does its full run — dispatch planned as usual.
  assert.equal(by.claimer.exclusive, true);
  assert.equal(by.claimer.deferred, undefined);
  assert.equal(by.claimer.dispatch.action, 'create');

  // Everything else that WANTED to run is deferred: run:true kept (its
  // precondition did find work), but no dispatch, no inline, no preprocessing.
  assert.equal(by.other.run, true);
  assert.match(by.other.deferred, /claimed this run exclusively/);
  assert.equal(by.other.dispatch, undefined);
  assert.equal(by.agentless.run, true);
  assert.ok(by.agentless.deferred);
  assert.equal(by.agentless.inline, undefined);
  assert.equal(by.agentless.prework, undefined, 'a deferred task must not run its preprocessing subprocess');

  // A task that had nothing to do is a skip, not a deferral — nothing was taken
  // from it.
  assert.equal(by.quiet.run, false);
  assert.equal(by.quiet.deferred, undefined);

  // And the deferred tasks cost no GitHub reads: the claim is decided before any
  // issue search happens.
  assert.deepEqual(searched, ['claimer']);
});

test('planRun claims nothing when the claimant\'s own precondition says skip', async () => {
  // `exclusive` is a rider on a RUN verdict. A task that is not running this cycle
  // has no run to claim, and reading the flag on its own would let a task that
  // declines its work still stop everyone else's.
  const tasks = [
    mkTask('claimer', { precondition: () => ({ run: false, exclusive: true, reason: 'nothing to do' }) }),
    mkTask('other', { precondition: () => ({ run: true, reason: 'work found' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}), existingIssuesFor: async () => [],
  });
  const by = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  assert.equal(by.other.deferred, undefined);
  assert.equal(by.other.dispatch.action, 'create');
});

test('planRun leaves the ordinary run untouched when nobody claims it', async () => {
  // The honest negative: `exclusive` is opt-in, and a corpus of tasks that never
  // mention it must schedule exactly as it did before.
  const tasks = [mkTask('a'), mkTask('b')];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}), existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 2);
  assert.ok(evaluations.every((e) => e.deferred === undefined && e.exclusive === undefined));
  assert.ok(evaluations.every((e) => e.dispatch.action === 'create'));
});

test('planRun does not defer a FORCED task behind an exclusive claim', async () => {
  // Forcing is a decision the operator already made on a hand-started run. A claim
  // swallowing it would make that run do nothing it was started for — and the
  // forced task cannot claim either (FORCED_VERDICT carries no `exclusive`).
  const tasks = [
    mkTask('claimer', { precondition: () => ({ run: true, exclusive: true, reason: 'overdue' }) }),
    // Weekly, so mid-week its slot has already been run — the only shape forcing
    // exists for (computeDueTaskSlots reaches for the most-recent slot).
    mkTask('forced', { frequency: 'weekly', precondition: () => ({ run: false, reason: 'nothing to do' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    overrides: { FORCE_TASKS: 'forced' },
    collectSignals: async () => ({}), existingIssuesFor: async () => [],
  });
  const by = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  assert.equal(by.forced.forced, true);
  assert.equal(by.forced.deferred, undefined);
  assert.equal(by.forced.dispatch.action, 'create');
});

test('planRun lets several claimants share the run, deferring only the rest', async () => {
  // Two claims are not a conflict to arbitrate: they all run and everything else
  // defers, which is the only reading that needs no priority order between packs.
  const tasks = [
    mkTask('c1', { precondition: () => ({ run: true, exclusive: true, reason: 'x' }) }),
    mkTask('c2', { precondition: () => ({ run: true, exclusive: true, reason: 'y' }) }),
    mkTask('other', { precondition: () => ({ run: true, reason: 'z' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}), existingIssuesFor: async () => [],
  });
  const by = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  assert.equal(by.c1.dispatch.action, 'create');
  assert.equal(by.c2.dispatch.action, 'create');
  assert.match(by.other.deferred, /p\/c1, p\/c2/);
});

test('runPrecondition normalizes `exclusive` like every other verdict field', () => {
  assert.equal(runPrecondition(mkTask('a', { precondition: () => ({ run: true, exclusive: true }) }), {}, {}).exclusive, true);
  assert.equal(runPrecondition(mkTask('b'), {}, {}).exclusive, false, 'a verdict that omits it is not claiming');
  assert.equal(runPrecondition(mkTask('c', { precondition: () => ({ run: true, exclusive: 'yes' }) }), {}, {}).exclusive, false, 'only a literal true claims');
});

// ── Dormancy: the gate ahead of every other decision ────────────────────────
test('planRun evaluates nothing at all when the project declares itself dormant', async () => {
  // A task whose precondition would say "run", and would even dispatch — the point
  // is that the dormant project never asks it. Forcing does not reach past this
  // either: FORCE_TASKS is a manual override of a PRECONDITION, and dormancy is not
  // a precondition — the way to run this project's tasks again is to wake it up.
  const tasks = [mkTask('runs', { precondition: () => ({ run: true, reason: 'work found' }) })];
  let collected = false; let askedIssues = false;
  const { evaluations, dormant } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    config: { dormant: true }, overrides: { FORCE_TASKS: 'runs' },
    collectSignals: async () => { collected = true; return {}; },
    existingIssuesFor: async () => { askedIssues = true; return []; },
  });
  assert.equal(dormant, true);
  assert.deepEqual(evaluations, []);
  assert.equal(collected, false, 'a dormant project pays for no signal collection');
  assert.equal(askedIssues, false, 'a dormant project files and searches no dispatch issue');
});

test('planRun runs normally when dormancy is absent or explicitly false', async () => {
  // The honest negative: `dormant` is opt-IN, so the overwhelmingly common shape —
  // no key at all — must not read as dormant, and neither must `false`. A gate this
  // wide failing open in the wrong direction would silently stop a whole repo.
  const tasks = [mkTask('runs', { precondition: () => ({ run: true, reason: 'work found' }) })];
  for (const config of [undefined, {}, { dormant: false }, { dormant: 'true' }]) {
    const { evaluations, dormant } = await planRun({
      tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
      config, collectSignals: async () => ({}), existingIssuesFor: async () => [],
    });
    assert.equal(dormant, undefined, `config ${JSON.stringify(config)} must not read as dormant`);
    assert.equal(evaluations.length, 1);
    assert.equal(evaluations[0].dispatch.action, 'create');
  }
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

test('planRun flags a task that declares prework (agentless and agentful)', async () => {
  const tasks = [
    mkTask('code', { agent_model: 'none', expected_outcome: 'none', prework: 'node worker.mjs', prework_timeout: 120, precondition: () => ({ run: true, reason: 'x' }) }),
    mkTask('prep-then-agent', { prework: 'node prepare.mjs', prework_timeout: 120, precondition: () => ({ run: true, reason: 'x' }) }),
  ];
  const { evaluations } = await planRun({
    tasks, schedule: D, now: '2026-07-22T06:00:00Z', lastSuccess: '2026-07-21T06:00:00Z',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  const byTask = Object.fromEntries(evaluations.map((e) => [e.task, e]));
  // agentless + prework: both flags set; the CLI runs the subprocess, not the in-process worker.
  assert.equal(byTask.code.prework, true);
  assert.equal(byTask.code.inline, true);
  // agentful + prework: prework flagged, and a dispatch is still planned for the hand-off.
  assert.equal(byTask['prep-then-agent'].prework, true);
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
    { pack: 'p', task: 'd', slotId: 'd2026-07-22', run: true, exclusive: true, dispatch: { action: 'create', reason: 'new' } },
    { pack: 'p', task: 'e', slotId: 'd2026-07-22', run: true, reason: 'work found', deferred: 'deferred — p/d claimed this run exclusively' },
  ]);
  assert.match(summary, /- p\/a \[d2026-07-22\] create — new/);
  assert.match(summary, /- p\/b \[d2026-07-22\] skip — quiet/);
  assert.match(summary, /- p\/c \[d2026-07-22\] run-inline — inline work/);
  // The claim and the deferral it caused are both legible in the run's own summary.
  assert.match(summary, /- p\/d \[d2026-07-22\] \(exclusive\) create — new/);
  assert.match(summary, /- p\/e \[d2026-07-22\] defer — deferred — p\/d claimed this run exclusively/);
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

// ── FORCE_TASKS: the slot gate, and no precondition at all (#515) ───────────
// Forcing lives entirely in the engine. No task declaration mentions it, no
// precondition is consulted for a forced task, and the first cut got both wrong:
// it asked the task's permission, and it asked too late to matter because the
// due list is computed BEFORE any precondition runs.

// 09:05, hourly scheduler last successful at 08:44 — so today's daily-2h slot
// (02:00) has already been passed by an earlier run. Exactly the mid-day manual
// run the override exists for.
const MIDDAY = { now: '2026-07-28T09:05:00Z', lastSuccess: '2026-07-28T08:44:00Z' };
const notDue = (id) => mkTask(id, { frequency: 'daily-2h', precondition: () => ({ run: false, reason: 'nothing to do' }) });

test('without an override a passed slot is not evaluated at all — the gate under test', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations, [], 'a passed slot yields no evaluation, so no precondition runs');
});

test('FORCE_TASKS runs a passed-slot task whose precondition says no', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].run, true, 'forced means run — the "nothing to do" verdict is never asked for');
  assert.equal(evaluations[0].forced, true);
  assert.equal(evaluations[0].dispatch.action, 'create');
  assert.match(evaluations[0].reason, /forced by FORCE_TASKS/);
  assert.match(evaluations[0].slotId, /^d2026-07-28$/, 'it runs under its most-recent slot, not a fabricated one');
});

test('a forced task\'s precondition is never CALLED — not called-and-ignored', async () => {
  // The sharpest form of "no task is aware of forcing": a precondition that would
  // throw if invoked. A forced run must not touch it at all.
  let called = false;
  const explodes = mkTask('boom', {
    frequency: 'daily-2h',
    precondition: () => { called = true; throw new Error('precondition must not run'); },
  });
  const { evaluations } = await planRun({
    tasks: [explodes], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'boom' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.equal(called, false, 'the precondition was invoked for a forced task');
  assert.equal(evaluations[0].run, true);
  assert.equal(evaluations[0].error, undefined);
});

test('a forced dispatch still carries a binding Context, naming the mechanism', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  const ctx = evaluations[0].context.join(' ');
  assert.match(ctx, /forced manually/i);
  assert.match(ctx, /precondition was not evaluated/i);
  // Generic: it must not name the task it happens to be forcing.
  assert.doesNotMatch(ctx, /baselining/i);
});

test('FORCE_TASKS forces ONLY the named ids — a sibling task is untouched', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining'), notDue('growth-extract')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations.map((e) => e.task), ['baselining']);
});

test('an id matching no discovered task forces nothing, and never throws', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'no-such-task' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.deepEqual(evaluations, []);
});

test('a task due on its own merit is judged normally, not forced', async () => {
  // Same slot due AND named in FORCE_TASKS: the due branch wins, so the task is
  // evaluated the ordinary way and its own "no" stands.
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D,
    now: '2026-07-28T02:30:00Z', lastSuccess: '2026-07-28T01:44:00Z', // the 02:00 slot IS due
    overrides: { FORCE_TASKS: 'baselining' },
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [],
  });
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].forced, undefined);
  assert.equal(evaluations[0].run, false, 'due on its own merit → its precondition decides');
});

test('forcedTaskIds reads only FORCE_TASKS, trimming and dropping blanks', () => {
  assert.deepEqual(forcedTaskIds({ FORCE_TASKS: 'a, b ,,c' }), ['a', 'b', 'c']);
  assert.deepEqual(forcedTaskIds({ FORCE_TASKS: '' }), []);
  assert.deepEqual(forcedTaskIds({}), []);
  assert.deepEqual(forcedTaskIds({ FORCE_BASELINING: 'true' }), [], 'the superseded key forces nothing');
});

test('FORCE_TASKS re-runs a slot the schedule already ran — exactly-once must not swallow the operator', async () => {
  // The exact silent-failure shape: the slot's dispatch issue already exists
  // (closed after a successful run), and the operator forces a re-run mid-day.
  // Without the per-run slot marker, planDispatch's state=all title match
  // answered 'skip' and FORCE_TASKS did nothing at all.
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    runId: '424242',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [
      { number: 9, title: '[claudinite-task] p/baselining d2026-07-28', state: 'closed' },
    ],
  });
  assert.equal(evaluations[0].slotId, 'd2026-07-28~f424242', 'a forced dispatch slot carries the run marker');
  assert.equal(evaluations[0].dispatch.action, 'create', 'the already-run slot must not block the forced dispatch');
});

test('a forced dispatch still never stacks on an OPEN dispatch of the same family', async () => {
  const { evaluations } = await planRun({
    tasks: [notDue('baselining')], schedule: D, ...MIDDAY,
    overrides: { FORCE_TASKS: 'baselining' },
    runId: '424242',
    collectSignals: async () => ({}),
    existingIssuesFor: async () => [
      { number: 9, title: '[claudinite-task] p/baselining d2026-07-28', state: 'open' },
    ],
  });
  assert.equal(evaluations[0].dispatch.action, 'suppress', 'at-most-one-open holds for forced runs too');
});
