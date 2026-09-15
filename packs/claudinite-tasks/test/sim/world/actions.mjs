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

  const idOf = (run) => `actions-${run.id}`;

  const port = {
    SCHEDULER_WORKFLOW_FILE,
    EXECUTOR_WORKFLOW_FILE,
    actionsEnv: () => (current ? { ...bag, ...current.env } : bag),
    repoRoot: () => root,
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

  // Start a run NOW. `body` executes synchronously against the current clock
  // instant; anything it wants to happen later it books on the clock itself.
  // `durationMs` is what the platform bills for, and `timeoutMs` the ceiling the
  // runner kills the job at.
  function startRun({ workflow, trigger, body = () => {}, durationMs = MINUTE, timeoutMs = null, concurrency = null, env: runEnv = {} }) {
    const held = concurrency && busy.get(concurrency);
    if (held) {
      // The concurrency group: a second run of the same group does not execute.
      // It is still a row, because the platform started it before deciding.
      runs.push({
        id: (runSeq += 1), workflow, trigger, startedAt: clock.ms(), endedAt: clock.ms(),
        conclusion: 'superseded', outputs: {}, env: runEnv,
      });
      return runs.at(-1);
    }
    const run = {
      id: (runSeq += 1), workflow, trigger, startedAt: clock.ms(), endedAt: null,
      conclusion: null, outputs: {}, env: runEnv,
    };
    runs.push(run);
    if (concurrency) busy.set(concurrency, run);

    const killAt = timeoutMs === null ? null : run.startedAt + timeoutMs;
    const endAt = killAt === null ? run.startedAt + durationMs : Math.min(run.startedAt + durationMs, killAt);
    const previous = current;
    current = run;
    try {
      body({ run, id: idOf(run) });
    } finally {
      current = previous;
    }
    clock.at(endAt, () => {
      run.endedAt = endAt;
      run.conclusion = killAt !== null && endAt === killAt && durationMs > timeoutMs ? 'cancelled' : 'success';
      if (concurrency && busy.get(concurrency) === run) busy.delete(concurrency);
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
    cron: (fromIso, toIso, body, { concurrency = 'claudinite-scheduler', durationMs = MINUTE } = {}) => {
      const from = at_(fromIso); const to = at_(toIso);
      for (let t = Math.ceil(from / HOUR) * HOUR + cronMinute * MINUTE; t < to; t += HOUR) {
        if (t < from) continue;
        if (cronHours && !cronHours.includes(new Date(t).getUTCHours())) continue;
        if (dropped.some(([a, b]) => t >= a && t < b)) continue;
        clock.at(t + startLatencyMs, () => startRun({
          workflow: SCHEDULER_WORKFLOW_FILE, trigger: 'schedule', body, durationMs, concurrency,
        }));
      }
      return harness;
    },
    // GitHub drops scheduled fires under load: in [from, to) the run simply
    // never happens, which is a fact about the platform and not about us.
    dropFires: (fromIso, toIso) => { dropped.push([at_(fromIso), at_(toIso)]); return harness; },

    // Turn every `workflow_dispatch` the GitHub fake accepts into a run. The
    // ledger then counts the engine's REAL dispatch calls rather than a model's
    // idea of when a chain fires.
    runDispatches: (body, { durationMs = MINUTE, timeoutMs = null } = {}) => {
      github.onDispatch((fired) => startRun({
        workflow: fired.workflow, trigger: 'workflow_dispatch', body: (ctx) => body({ ...ctx, fired }),
        durationMs, timeoutMs,
      }));
      return harness;
    },

    // What the platform billed: each run's job rounded UP to the minute, which
    // is why a run that exited immediately still costs one.
    billedMinutes: () => runs
      .filter((r) => r.endedAt !== null)
      .reduce((sum, r) => sum + Math.max(1, Math.ceil((r.endedAt - r.startedAt) / MINUTE)), 0),
    runsOf: (workflow) => runs.filter((r) => r.workflow === workflow),

    // THE OPERATOR HOLD, set where both readers look: the env bag the run starts
    // with, and the repo variable a drain re-reads between items.
    suspendAll: () => { bag[SUSPEND_ALL_VAR] = 'true'; github.setVariable(SUSPEND_ALL_VAR, 'true'); return harness; },
    resumeAll: () => { delete bag[SUSPEND_ALL_VAR]; github.clearVariable(SUSPEND_ALL_VAR); return harness; },
  };
  return harness;
}
