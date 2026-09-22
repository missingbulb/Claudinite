// THE FAKE GITHUB ACTIONS — workflow runs as first-class events, and the runner
// environment the scheduler and the executor read themselves out of.
//
// It stands in for `src/world/actions.mjs`: `port` carries exactly that module's
// names, and the scenario levers hang off the harness beside it.
//
// A RUN IS THE BILLED UNIT, which is why this module keeps a ledger rather than
// a counter. Actions bills each JOB's wall time rounded UP to the minute, so a
// run that does nothing but read the hold and exit still costs a minute — and a
// design question like "what does an hourly cron cost on a quiet repo" is
// answered by the ledger's rows, never by how much work got done.
//
// The two workflow file names and the hold variable's name are IMPORTED from the
// real ports rather than restated: they are our own names, not the platform's,
// and a fake that spelled its own copy would go on passing after a rename.

import { EXECUTOR_WORKFLOW_FILE, SCHEDULER_WORKFLOW_FILE } from '../../../src/world/actions.mjs';
import { SUSPEND_ALL_VAR } from '../../../src/world/hold.mjs';
import { HOUR, MINUTE } from './clock.mjs';

const at_ = (when) => (typeof when === 'number' ? when : Date.parse(when));

export function makeActions({
  clock,
  github,
  repo = 'o/r',
  defaultBranch = 'main',
  root = '/repo',
  // The UTC hours the cron fires on — `null` is the every-hour grid. A member's
  // real cron names its hours explicitly, and what that costs and delays is a
  // question only a modelled grid can answer.
  cronHours = null,
  cronMinute = 17,
  // How long after the fire the runner actually starts. Actions does not start a
  // scheduled run at its cron instant, and a latency of zero is the one value
  // that is certainly wrong.
  startLatencyMs = 2 * MINUTE,
  env = {},
} = {}) {
  if (cronHours !== null && (!Array.isArray(cronHours) || cronHours.length === 0)) {
    // An empty list is not "the default grid" — it is a cron that never fires,
    // and every latency assertion over such a world passes vacuously.
    throw new Error('cronHours must be a non-empty array of UTC hours, or null for the every-hour grid');
  }

  const bag = { GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: defaultBranch, GITHUB_SERVER_URL: 'https://github.com', ...env };
  const runs = [];            // the ledger: one row per started run
  const dropped = [];         // [fromMs, toMs) windows where the cron fire never arrives
  let runSeq = 0;
  let current = null;         // the run whose job is executing right now
  const busy = new Map();     // concurrency group -> the run holding it
  const waiting = new Set();  // groups with a run already queued behind the holder

  const idOf = (run) => `actions-${run.id}`;

  const port = {
    SCHEDULER_WORKFLOW_FILE,
    EXECUTOR_WORKFLOW_FILE,
    actionsEnv: () => (current ? { ...bag, ...current.env } : bag),
    repoRoot: () => root,
    // The simulator runs no subprocess, so nothing here ever runs with a task
    // directory as its cwd; the name exists so the parity check can see it, and it
    // answers what the real port would outside one.
    taskDir: () => root,
    actionRepoContext: (e = port.actionsEnv()) => ({
      repo: e.GITHUB_REPOSITORY || null,
      defaultBranch: e.GITHUB_REF_NAME || 'main',
    }),
    runUrl: (e = port.actionsEnv()) => (current ? `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${current.id}` : null),
    runUrlFor: (slug, e = port.actionsEnv()) => (current ? `${e.GITHUB_SERVER_URL}/${slug}/actions/runs/${current.id}` : null),
    executorId: (e = port.actionsEnv()) => e.CLAUDINITE_EXECUTOR_ID || (current ? idOf(current) : 'actions-local'),
    // No output file outside a run, exactly as outside Actions — and the value
    // lands on the run's own row, which is where the next step reads it.
    setStepOutput: (name, value) => {
      if (!current) return false;
      current.outputs[name] = String(value);
      return true;
    },
  };

  // Start a run NOW. `body` may be async and takes as long as it takes — a job is
  // the unit the platform bills, so a run that does real work has to be able to
  // occupy real virtual time. `run.done` settles when the body does, and every
  // caller here awaits it: a run left floating would let the clock advance through
  // the middle of a job.
  //
  // `durationMs` is the declared length of a body that does nothing in particular;
  // `measure: true` says the body's own span is the length, which is what a run
  // driving the engine wants. `timeoutMs` is the ceiling the runner kills the job
  // at, and a killed job's body is simply ABANDONED — its promise is never awaited
  // again, exactly as a runner's process is not.
  function startRun({
    workflow, trigger, body = () => {}, durationMs = MINUTE, timeoutMs = null,
    concurrency = null, env: runEnv = {}, measure = false,
  }) {
    // THE CONCURRENCY GROUP, as `cancel-in-progress: false` actually behaves: one
    // run in progress and at most ONE pending behind it. A second run of the group
    // WAITS and then runs — which is what makes the scheduler run serialized rather
    // than skipped, and the whole reason its duplicate-standing-item self-heal can
    // never race itself. A third, arriving while one already waits, is the one the
    // platform supersedes.
    const held = concurrency && busy.get(concurrency);
    if (held) {
      if (waiting.has(concurrency)) {
        runs.push({
          id: (runSeq += 1), workflow, trigger, startedAt: clock.ms(), endedAt: clock.ms(),
          conclusion: 'superseded', outputs: {}, env: runEnv, done: Promise.resolve(), ended: Promise.resolve(),
        });
        return runs.at(-1);
      }
      waiting.add(concurrency);
      const queued = { done: null };
      // It waits for the holder to END — not for its body to settle. A run whose
      // length is declared rather than measured finishes its body at once and holds
      // the group until its declared end, and a waiter keyed on the body would
      // re-queue itself in a tight loop against a group still busy.
      queued.done = clock.park(held.ended).then(() => {
        waiting.delete(concurrency);
        const run = startRun({ workflow, trigger, body, durationMs, timeoutMs, concurrency, env: runEnv, measure });
        Object.assign(queued, run);
        return run.done;
      });
      return queued;
    }
    const run = {
      id: (runSeq += 1), workflow, trigger, startedAt: clock.ms(), endedAt: null,
      conclusion: null, outputs: {}, env: runEnv,
    };
    // When this run RELEASES its group, which is not when its body settles.
    let markEnded;
    run.ended = new Promise((r) => { markEnded = r; });
    runs.push(run);
    if (concurrency) busy.set(concurrency, run);

    const killAt = timeoutMs === null ? null : run.startedAt + timeoutMs;
    const finish = (conclusion) => {
      if (run.endedAt !== null) return;
      run.endedAt = clock.ms();
      run.conclusion = conclusion;
      if (concurrency && busy.get(concurrency) === run) busy.delete(concurrency);
      markEnded();
    };

    const previous = current;
    current = run;
    let outcome;
    try { outcome = body({ run, id: idOf(run) }); } finally { current = previous; }

    if (measure) {
      // The body IS the job: it ends when the body does, and the ledger bills what
      // it actually took. A body that throws is a job that failed — which is what
      // the continuation job downstream exists for.
      run.done = Promise.resolve(outcome).then(
        () => finish('success'),
        (e) => { finish('failure'); run.error = e; },
      );
      if (killAt !== null) clock.at(killAt, () => finish('cancelled'));
      return run;
    }

    const endAt = killAt === null ? run.startedAt + durationMs : Math.min(run.startedAt + durationMs, killAt);
    run.done = Promise.resolve(outcome).then(() => {}, (e) => { run.error = e; });
    clock.at(endAt, () => {
      if (run.endedAt !== null) return;
      run.endedAt = endAt;
      run.conclusion = killAt !== null && endAt === killAt && durationMs > timeoutMs ? 'cancelled' : 'success';
      if (concurrency && busy.get(concurrency) === run) busy.delete(concurrency);
      markEnded();
    });
    return run;
  }

  const harness = {
    port,
    runs: () => runs,
    startRun,
    // The env bag a scenario seeds a secret or an executor id into.
    env: bag,
    setEnv: (name, value) => { bag[name] = value; return harness; },

    // Book the cron grid across a window: one fire per hour on the grid, at
    // `cronMinute`, each starting `startLatencyMs` later — the run's START is
    // what the ledger records, because that is when the platform begins billing.
    cron: (fromIso, toIso, body, { concurrency = 'claudinite-scheduler', durationMs = MINUTE, measure = false } = {}) => {
      const from = at_(fromIso); const to = at_(toIso);
      for (let t = Math.ceil(from / HOUR) * HOUR + cronMinute * MINUTE; t < to; t += HOUR) {
        if (t < from) continue;
        if (cronHours && !cronHours.includes(new Date(t).getUTCHours())) continue;
        if (dropped.some(([a, b]) => t >= a && t < b)) continue;
        clock.at(t + startLatencyMs, () => startRun({
          workflow: SCHEDULER_WORKFLOW_FILE, trigger: 'schedule', body, durationMs, concurrency, measure,
        }).done);
      }
      return harness;
    },
    // GitHub drops scheduled fires under load: in [from, to) the run simply
    // never happens, which is a fact about the platform and not about us.
    dropFires: (fromIso, toIso) => { dropped.push([at_(fromIso), at_(toIso)]); return harness; },

    // Turn every `workflow_dispatch` the GitHub fake accepts into a run. The
    // ledger then counts the engine's REAL dispatch calls rather than a model's
    // idea of when a chain fires.
    runDispatches: (body, { durationMs = MINUTE, timeoutMs = null, measure = false } = {}) => {
      // A dispatch is a REQUEST for a run, and the platform starts it a moment
      // later on its own runner — never inside the call that asked for it. Booked
      // on the clock for that reason: a run that began inside the dispatching run's
      // own step would be draining the queue while the run that dispatched it was
      // still writing to it.
      github.onDispatch((fired) => clock.at(clock.ms() + startLatencyMs, () => startRun({
        workflow: fired.workflow, trigger: 'workflow_dispatch', body: (ctx) => body({ ...ctx, fired }),
        durationMs, timeoutMs, measure, env: fired.inputs ?? {},
      }).done));
      return harness;
    },

    // What the platform billed: each run's job rounded UP to the minute, which
    // is why a run that exited immediately still costs one.
    billedMinutes: () => runs
      .filter((r) => r.endedAt !== null)
      .reduce((sum, r) => sum + Math.max(1, Math.ceil((r.endedAt - r.startedAt) / MINUTE)), 0),
    runsOf: (workflow) => runs.filter((r) => r.workflow === workflow),

    // THE OPERATOR HOLD, set in the env bag a run starts with — the one place the
    // engine reads it (hold.mjs). A run already past its first act does not see it.
    suspendAll: () => { bag[SUSPEND_ALL_VAR] = 'true'; return harness; },
    resumeAll: () => { delete bag[SUSPEND_ALL_VAR]; return harness; },
  };
  return harness;
}
