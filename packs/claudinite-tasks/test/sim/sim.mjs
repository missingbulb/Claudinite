// THE HARNESS — the fake world of `world/` wired to the real queue, and nothing
// else. It holds no model of the mechanism: every verdict a scenario asserts on
// was reached by the code under `src/`, driven here against an in-memory GitHub,
// a virtual clock and a scripted set of agent sessions.
//
// WHAT IT OWNS is a world and a cast:
//
//  - THE WORLD is `world/`: the clock and its event queue, the GitHub store, the
//    Actions ledger, the invocation endpoint, the agent sessions and the people.
//    Each of those modules says what it models and what it does not.
//  - THE CAST is the scenario's tasks. A scenario states a task the way a
//    declaration does — a cadence term, an `after`, whether it has a work step and
//    how long it takes — plus a `precondition` function standing for every
//    condition a real declaration would name in terms of its own signals. That
//    function is loaded as a TASK-LOCAL TERM (`gate`), so the real precondition
//    engine evaluates it in the real expression, in the real two passes.
//  - THE LEVERS are what a person does: marking an issue, creating an item,
//    re-queueing a park, forcing a task, holding the queue. Each one drives the
//    real path a person's action takes — a label edit through the GitHub port, a
//    wake through the scheduler workflow's own `wake` input.
//
// WHAT IT DOES NOT OWN is any answer. There is no scheduler here, no pick order,
// no claim arbitration and no anchor arithmetic: `schedulerRun`, `runExecutor`,
// `sweepQueue`, `continueOrEscalate` and `convergeOps` are imported and run. When
// a scenario and the engine disagree, the disagreement is the finding — which is
// the whole reason this file may not contain a second opinion.
//
// THE LOG is an OBSERVATION, not a state machine: `record` is called where the
// harness itself acts (a workflow starts, a lever is pulled) and where the engine
// hands back what it decided (`asked`, the ops, the janitor's result), plus a
// classification of the WRITES the engine made, read off the GitHub store as they
// land. Nothing in it is computed from a rule.

import { fileURLToPath } from 'node:url';

import { makeClock, MINUTE, HOUR, DAY } from './world/clock.mjs';
import { makeGithub } from './world/github.mjs';
import { makeActions } from './world/actions.mjs';
import { makeAgents } from './world/agents.mjs';
import { makeSessions } from './world/sessions.mjs';
import { makeHumans } from './world/humans.mjs';

import { ENDPOINTS_KEY } from '../../../../engine/checks/helpers/repo-context.mjs';
import { installClock } from '../../src/world/clock.mjs';
import { SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE } from '../../src/world/actions.mjs';
import { isSuspended, SUSPEND_ALL_VAR } from '../../src/world/hold.mjs';
import { schedulerRun } from '../../src/schedule/run.mjs';
import { dispatchDrain } from '../../src/schedule/drain-dispatch.mjs';
import { runExecutor } from '../../src/execute/loop.mjs';
import { continueOrEscalate, nextDepth } from '../../src/recover/continuation.mjs';
import { sweepQueue } from '../../tasks/task-janitor/queue-sweep.mjs';
import { convergeOps, refusal } from '../../src/session/converge-item.mjs';
import { normalizeTaskDeclaration, taskCadence } from '../../src/contract/task-contract.mjs';
import { mostRecentAnchor } from '../../src/items/anchors.mjs';
import { validatePreconditions } from '../../src/contract/precondition-policy.mjs';
import { collectSignalsForTask } from '../../src/signals/for-task.mjs';
import { EXECUTING_LEASH_MS } from '../../public/task-constants.mjs';
import { HEARTBEAT_MS, HEARTBEAT_MARKER } from '../../src/items/heartbeat.mjs';
import { REQUEST_TASK_ID, REQUEST_TASK, BUILT_IN_PACK } from '../../src/contract/built-in-tasks.mjs';
import { terms as requestTerms } from '../../queue/tasks/implement-request/preconditions.mjs';
import {
  STATUS_READY, URGENT, STATUS_BLOCKED, EPISODE_MARKER, CLAIM_MARKER, HANDOFF_MARKER, STATUS_DONE,
  STATUS_REJECTED, STATUS_LABELS, PARK_PREFIX, ORIGIN_PLANNED, ORIGIN_MANUAL, ORIGIN_AD_HOC,
} from '../../public/task-constants.mjs';
import {
  statusOf, isParked, parkKindOf, outcomeOf, originOf, workItemTitle, workItemBody,
  parseWorkItemTitle, parseWorkItemBody, taskIdFromPath,
} from '../../public/work-item-grammar.mjs';

export { MINUTE, HOUR, DAY };
export { STATUS_READY, ORIGIN_AD_HOC, ORIGIN_PLANNED, ORIGIN_MANUAL, statusOf, isParked, parkKindOf };

// A scenario's instant, in the shorthand its `at(…)` calls are written in: a bare
// `2026-08-12T09:03Z` is a minute, not a second.
export const T = (iso) => Date.parse(iso.length === 17 ? iso.replace('Z', ':00Z') : iso);

// How long after its cron instant a run actually starts. Actions does not start a
// scheduled run at the minute it was asked to, and a latency of zero is the one
// value that is certainly wrong — so a scenario naming the instant a tick HAPPENED
// says `tick('…04:17Z')` rather than transcribing the delay.
export const START_LATENCY_MS = 40_000;
export const tick = (iso) => T(iso) + START_LATENCY_MS;

// The park label of a kind, for a scenario naming one.
export const NH = (kind) => `${PARK_PREFIX}${kind}`;

const REPO = 'o/r';
const DEFAULT_BRANCH = 'main';
// The checkout the run reads tasks out of. The executor probes a task's directory
// before it spawns anything, so this has to be a real one — and this folder is the
// only directory a harness can be sure of.
const ROOT = fileURLToPath(new URL('.', import.meta.url));

// The whole of what a fake session costs, in the shape the invoker's config takes.
const CONFIG = Object.freeze({
  taskScheduler: {
    dailyHour: 4,
    weeklyDay: 'Sun',
    monthlyDay: 1,
    [ENDPOINTS_KEY]: { default: { url: 'https://example.invalid/fire', tokenSecret: 'CCR_TOKEN' } },
  },
  packConfig: {},
});

// A run that dies the way a runner dies: no exception a caller could handle, no
// labels written, nothing said. The executor's promise simply never returns, which
// is what leaves the item wearing its claim for the leash to reclaim.
class RunnerDied extends Error {}

// The two triggers a `workflow_dispatch` of the executor can carry, told apart by
// the input the continuation job sets. A dispatch with no depth is the scheduler
// run's drain job.
const triggerOf = (fired) => (fired?.inputs?.continuation_depth ? 'failure-redispatch' : 'scheduler-run-drain');

export function makeSim({
  tasks = [],
  schedulerRunMinute = 17,
  // The UTC hours the cron fires on — `null` is the every-hour grid. A member's
  // real cron names its hours explicitly, and what that costs and delays is the
  // question the cadence scenarios ask.
  cronHours = null,
  executingLeashMs = EXECUTING_LEASH_MS,
  heartbeatMinutes = HEARTBEAT_MS / MINUTE,
  heartbeatsDisabled = false,
  pickSeed = 1,
  collaborators = { owner: 'admin' },
  // How long after the cron instant the runner actually starts, and how long after
  // a dispatch. Actions starts neither at the instant it was asked to.
  startLatencyMs = START_LATENCY_MS,
} = {}) {
  // The one wiring relation the engine states (F17, reframed): a beat that does not
  // sit inside the leash arrives too late to keep a live holder out of the reclaim.
  // Refused here rather than discovered mid-scenario, because a world wired that way
  // livelocks and every assertion over it is about the wiring, not the mechanism.
  if (heartbeatMinutes * MINUTE >= executingLeashMs) {
    throw new Error(`heartbeat interval (${heartbeatMinutes}m) reaches the executing leash — F17 (reframed)`);
  }

  const clock = makeClock({ start: 0 });
  const github = makeGithub({ clock, repo: REPO, collaborators });
  const agents = makeAgents({ clock, github, repo: REPO });
  const sessions = makeSessions({ clock, agents, repo: REPO });
  const actions = makeActions({
    clock, github, repo: REPO, defaultBranch: DEFAULT_BRANCH, root: ROOT,
    cronHours, cronMinute: schedulerRunMinute, startLatencyMs,
  });
  const humans = makeHumans({ clock, github, repo: REPO });

  // The scenario's own signal state, which its `precondition` functions read.
  const world = {};
  const log = [];
  const record = (kind, extra = {}) => { log.push({ t: clock.ms(), at: clock.iso(), kind, ...extra }); return log.at(-1); };

  // --- the cast -----------------------------------------------------------

  const registry = new Map();
  const buildTask = (spec) => {
    const [pack, ...rest] = String(spec.id).split('/');
    const id = rest.join('/');
    const stated = Array.isArray(spec.preconditions) ? [...spec.preconditions] : [];
    const terms = new Map();
    if (spec.precondition) {
      // The scenario's condition, as a task-local term. Its signal name is one no
      // collector answers, which is exactly right: the scheduler's cheap first pass
      // then cannot decide it, so the run-history terms are judged alone first and
      // the whole expression only where they did not settle it — the engine's own
      // two passes, unmodelled.
      terms.set('gate', {
        signals: ['world'],
        holds(signals, { item, now }) {
          const since = signals?.runs?.window?.sinceIso;
          const window = { since: since ? Date.parse(since) : null, days: signals?.runs?.window?.days ?? null };
          const verdict = spec.precondition(world, new Date(now).getTime(), item, window) ?? {};
          if (verdict.error) return { error: verdict.error };
          return verdict.run === false
            ? { holds: false, reason: verdict.reason ?? 'no work' }
            : { holds: true, reason: verdict.reason ?? null };
        },
      });
    }
    const decl = normalizeTaskDeclaration({
      id,
      // A declaration still carrying the retired `frequency` field goes through
      // the contract's own door, which is what turns it into the cadence term it
      // always meant; one stating its preconditions outright goes through
      // untouched.
      ...(spec.frequency !== undefined
        ? { frequency: spec.frequency, ...(spec.preconditions !== undefined ? { preconditions: stated } : {}) }
        : { preconditions: spec.precondition ? [...stated, 'gate'] : stated }),
      // ON THE SCHEDULE is decided by the STATED cadence terms, never by the
      // scenario's gate: a scenario whose task states no cadence is one the
      // scheduler never asks, and it runs only from an item somebody created. A
      // declaration stating its trigger outright keeps it, as the contract does.
      ...(spec.trigger !== undefined ? { trigger: spec.trigger }
        : spec.frequency !== undefined ? {} : { trigger: stated.length ? 'schedule' : 'request' }),
      agent_model: spec.agentMinutes != null ? 'sonnet' : 'none',
      ...(spec.codeWorkMinutes != null ? { code_work: 'node worker.mjs', code_work_timeout: 50 } : {}),
      ...(spec.schedule_after ? { schedule_after: spec.schedule_after } : {}),
      expected_outcome: 'fresh_pr',
    }, terms);
    // THE DOOR, as the contract runs it. A declaration that leaves the frequency
    // door naming a cadence no calendar has — a retired spelling — is refused
    // here, where the engine's own declaration check refuses it at author time.
    if (spec.precondition && !decl.preconditions.includes('gate')) decl.preconditions.push('gate');
    const problems = validatePreconditions(decl.preconditions, terms);
    if (problems.length) throw new Error(`${spec.id}: ${problems[0].what}`);
    return { pack, id, taskDir: ROOT, taskPath: `packs/${pack}/tasks/${id}/task.md`, decl, terms, spec };
  };

  const addTask = (spec) => { const t = buildTask(spec); registry.set(`${t.pack}/${t.id}`, t); return t; };
  for (const spec of tasks) addTask(spec);

  // THE BUILT-IN REQUEST TASK, wherever the queue runs. Its declaration and its
  // security term are the engine's own files — a harness that restated either
  // would be proving its own copy.
  const requestTask = {
    pack: BUILT_IN_PACK,
    id: REQUEST_TASK,
    taskDir: ROOT,
    taskPath: `packs/claudinite-tasks/queue/tasks/${REQUEST_TASK}/task.md`,
    terms: new Map(Object.entries(requestTerms)),
    spec: { id: REQUEST_TASK_ID, agentMinutes: 45, deliversOpenPr: () => true },
  };
  requestTask.decl = normalizeTaskDeclaration({
    id: REQUEST_TASK, trigger: 'request', preconditions: ['request-eligible'],
    agent_model: 'opus', model_from_request: true, expected_outcome: 'fresh_pr',
    on_interrupt: 'needs-human',
  }, requestTask.terms);
  registry.set(REQUEST_TASK_ID, requestTask);

  const taskList = () => [...registry.values()];
  const taskOf = (id) => registry.get(id) ?? null;

  // --- the seams the engine runs on ---------------------------------------

  const signalsUnavailable = new Set();
  const crashNext = new Set();
  const crashDuringWork = new Map();

  // The run history and every other signal come from the real collectors over the
  // fake GitHub — so a cadence term reads the queue this world actually holds.
  const collectorFor = ({ items = null } = {}) => {
    const real = collectSignalsForTask({
      gh: github.gh, repo: REPO, root: ROOT, config: CONFIG, defaultBranch: DEFAULT_BRANCH, items,
    });
    return async (task, now, item = null, opts = {}) => {
      const id = `${task.pack}/${task.id}`;
      // The scheduler's own ask, with signals it cannot collect: a missing
      // credential, a failed read. The cheap first pass still runs — the run-history
      // terms read the queue the run already holds — so this bites only where they
      // did not decide.
      if (item === null && signalsUnavailable.has(id) && !(opts.only ?? []).includes('runs')) {
        throw new Error('the signals for this task could not be collected');
      }
      if (item !== null) {
        // THE EXECUTOR'S PICK-TIME EVALUATION. The executor collects for an item
        // exactly once, after it has validated the item and before it takes a
        // verdict — so this call IS the evaluation, and recording it here needs no
        // rule about when one happens.
        record('evaluate', { task: id, issue: item.number, run: `${item.number}` });
        if (crashNext.delete(id)) {
          record('executor-crash', { task: id, issue: item.number });
          throw new RunnerDied(`the runner holding #${item.number} died`);
        }
      }
      return real(task, now, item, opts);
    };
  };

  // The work step. Its length is virtual minutes on the clock, so the heartbeat
  // beats through it and the leash measures the same silence production would.
  const runTaskCodeWork = async (task, { item, target }) => {
    const spec = task.spec;
    const id = `${task.pack}/${task.id}`;
    const dieAt = crashDuringWork.get(id);
    if (dieAt !== undefined) {
      crashDuringWork.delete(id);
      await clock.sleep(dieAt * MINUTE);
      record('executor-crash', { task: id, issue: item.number });
      throw new RunnerDied(`the runner holding #${item.number} died ${dieAt}m into its work`);
    }
    await clock.sleep((spec.codeWorkMinutes ?? 1) * MINUTE);
    if (spec.codeWorkFails?.(world, clock.ms())) {
      const kind = spec.codeWorkTriage?.(world, clock.ms()) ?? null;
      return { ok: false, why: 'the work step failed', ...(kind ? { triage: { kind } } : {}) };
    }
    const wantsAgent = spec.agentMinutes != null
      && (spec.requestsAgent ? !!spec.requestsAgent(world, clock.ms()) : true);
    if (wantsAgent) return { ok: true, agentRequested: true };
    if (spec.deliversOpenPr?.(world, clock.ms())) {
      const pr = github.seedPull({ head: { ref: target?.branch ?? `claudinite/${id}/pr`, sha: 'x' } });
      return { ok: true, agentRequested: false, delivered: [`PR: #${pr.number} (open)`], openPr: pr.number, deliveredPr: pr.number };
    }
    return { ok: true, agentRequested: false };
  };

  // What every session does: the task's own script, converged through the real
  // planner. The harness supplies the transport a session's GitHub tools would —
  // and nothing else, because the judgment is the outcome word the script names.
  const applyConverge = async (number, plan) => {
    const item = github.find(number);
    if (refusal(item, number)) return;
    for (const op of convergeOps(item, plan)) {
      if (op.kind === 'comment') await github.port.comment(null, REPO, op.issue, op.body);
      else if (op.kind === 'addLabel') await github.port.addLabel(null, REPO, op.issue, op.name);
      else if (op.kind === 'removeLabel') await github.port.removeLabel(null, REPO, op.issue, op.name);
      else if (op.kind === 'setBody') await github.port.setIssueBody(null, REPO, op.issue, op.body);
      else if (op.kind === 'close') await github.port.closeIssue(null, REPO, op.issue, op.stateReason);
      else if (op.kind === 'closePull') {
        await github.port.comment(null, REPO, op.number, op.body);
        await github.port.closePull(null, REPO, op.number);
      }
    }
  };

  const scriptSessions = () => {
    for (const task of taskList()) {
      const id = `${task.pack}/${task.id}`;
      const spec = task.spec;
      agents.script(id, {
        minutes: spec.agentMinutes ?? 45,
        heartbeatMinutes: null,
        get dies() { return crashAgent.delete(id); },
        run: async ({ item }) => {
          if (spec.agentFails?.(world, clock.ms())) {
            await applyConverge(item.number, { outcome: 'failure', summary: 'the session broke', pr: null });
            return;
          }
          if (spec.deliversOpenPr?.(world, clock.ms())) {
            const pr = github.seedPull({ head: { ref: `claudinite/${id}/session`, sha: 'x' } });
            await applyConverge(item.number, { outcome: 'approval', summary: 'a pull request is open for review', pr: pr.number });
            return;
          }
          await applyConverge(item.number, { outcome: 'done', summary: 'the session did the work', pr: null });
        },
      });
    }
  };
  const crashAgent = new Set();

  // --- the workflows ------------------------------------------------------

  const suspended = () => isSuspended(actions.port.actionsEnv());
  const draw = (() => {
    // A seeded draw so a scenario replays identically; production's is random
    // (PRINCIPLES.md) and a test that let it vary would be a coin flip.
    let s = pickSeed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  })();

  const schedulerBody = (wake = '') => async () => {
    if (suspended()) { record('suspended-skip', { workflow: 'scheduler-run' }); return; }
    record('scheduler-run', { wake: wake || undefined });
    const result = await schedulerRun({
      gh: github.gh, repo: REPO, root: ROOT, config: CONFIG, tasks: taskList(),
      defaultBranch: DEFAULT_BRANCH, now: clock.port.now(),
      collectSignalsFor: collectorFor, wake,
      // The run's own log, classified. Two things it says that the ops do not: a
      // write it could not make, and what the forced wake actually did — which is
      // `planWake`'s three answers, and the only place they are reported.
      log: (line) => {
        let m;
        if ((m = /^! could not create the work item for (\S+)/.exec(line))) record('create-failed', { task: m[1] });
        else if ((m = /^- woke #(\d+) (\S+)/.exec(line))) record('force', { task: m[2], issue: Number(m[1]) });
        else if ((m = /^- created #(\d+) (\S+) \(forced/.exec(line))) record('force', { task: m[2], issue: Number(m[1]), minted: true });
        else if ((m = /^- (\S+) is already in flight on #(\d+)/.exec(line))) record('force', { task: m[1], issue: Number(m[2]), already: true });
        else if ((m = /^! nothing woken for "([^"]+)": (.*)$/.exec(line))) {
          record('force', { task: m[1], issue: null, why: m[2], ...(/is not on the schedule/.test(m[2]) ? { nothing: true } : { unmatched: true }) });
        }
      },
      setOutput: () => true,
    });
    for (const a of result.asked) record('ask', { task: a.task, verdict: a.verdict, reason: a.reason });
    for (const op of result.ops) {
      if (op.kind === 'create') record('create', { task: `${op.pack}/${op.task}` });
      else if (op.kind === 'ready') record('ready', { issue: op.issue });
      else if (op.kind === 'reclaim') record('reclaim', { issue: op.issue, task: taskIdOfIssue(op.issue), to: op.to });
      else if (op.kind === 'dedupe') record('dedupe', { issue: op.issue, task: `${op.pack}/${op.task}` });
      else if (op.kind === 'adopt') record('adopt', { request: op.request, task: op.task, model: op.model });
      else if (op.kind === 'retire-orphan') record('retire-orphan', { issue: op.issue });
    }
    // The drain job, gated on the run's own parting look at the queue.
    if (result.pickable) await dispatchDrain(github.gh, REPO, DEFAULT_BRANCH, () => {});
    else record('drain-skipped', {});
  };

  const executorBody = async ({ run, id, fired }) => {
    const trigger = fired ? triggerOf(fired) : 'label-event';
    if (suspended()) { record('suspended-skip', { workflow: 'executor', trigger }); return; }
    const runId = `R${run.id}`;
    record('executor-run', { run: runId, exec: id, trigger });
    try {
      const done = await runExecutor({
        gh: executorGh, repo: REPO, root: ROOT, config: CONFIG, tasks: taskList(),
        executorId: id, runUrl: null,
        now: () => clock.port.now(), random: draw,
        heartbeatMs: heartbeatsDisabled ? 0 : heartbeatMinutes * MINUTE,
        timers: clock.timers(),
        // Built per ask, as the executor's own wiring builds it (execute/loop.mjs).
        collectSignalsFor: (task, now, item, opts) => collectorFor()(task, now, item, opts),
        runTaskCodeWork,
        invokeAgent: sessions.port.agentInvoker({ repo: REPO, config: CONFIG }),
        // The run's own log, for the two exits that leave no artifact of their
        // own: a lost claim race and a reverted claim are both "this run let go",
        // and only the run says which.
        log: (line) => {
          let m;
          if ((m = /^- #(\d+): another executor holds/.exec(line))) record('claim-lost', { issue: Number(m[1]), exec: id });
          else if ((m = /^- #(\d+): reverted —/.exec(line))) record('claim-reverted', { issue: Number(m[1]), exec: id });
          else if ((m = /^- #(\d+).*reclaimed while this run's work step ran/.exec(line))) record('claim-stale', { issue: Number(m[1]), exec: id });
        },
      });
      record('run-end', { run: runId, exec: id, trigger, settled: done.length });
    } catch (e) {
      if (!(e instanceof RunnerDied)) throw e;
      // The job went red, so the workflow's continuation job runs on a fresh
      // runner. Its own decision — continue or escalate — is the engine's.
      const depth = nextDepth(fired?.inputs?.continuation_depth);
      await continueOrEscalate(github.gh, REPO, DEFAULT_BRANCH, depth).catch(() => {});
    }
  };

  const janitorBody = async () => {
    if (suspended()) { record('suspended-skip', { workflow: 'janitor' }); return; }
    const result = await sweepQueue(github.gh, REPO, clock.port.now(), { tasks: taskList(), log: () => {} });
    for (const n of result.staleReady) record('escalate', { issue: n, task: taskIdOfIssue(n), rule: 'stale-ready' });
    for (const n of result.deadAgents) record('agent-reclaim', { issue: n, task: taskIdOfIssue(n) });
    for (const n of result.stuck) record('escalate', { issue: n, task: taskIdOfIssue(n), rule: 'stuck-dependency' });
    for (const n of result.stateless) record('repair-stateless', { issue: n });
    for (const n of [...result.superseded, ...result.orphaned, ...result.ended, ...result.abandoned, ...result.unclosed]) {
      record('janitor-close', { issue: n });
    }
  };

  // Every dispatch the ENGINE fires becomes a run, on the platform's own latency.
  actions.runDispatches(executorBody, { measure: true });

  // --- reading the world back ---------------------------------------------

  const taskIdOfIssue = (number) => {
    const i = github.find(number);
    if (!i) return null;
    const parsed = parseWorkItemTitle(i.title);
    if (parsed) return `${parsed.pack}/${parsed.task}`;
    const byPath = taskIdFromPath(parseWorkItemBody(i.body ?? '').taskPath);
    return byPath ? `${byPath.pack}/${byPath.task}` : null;
  };

  // An item as a scenario reads it: the issue the engine actually wrote, with the
  // handful of derived facts an assertion wants spelled out. A SNAPSHOT — the store
  // keeps moving, so a scenario re-reads by number rather than holding one.
  const view = (i) => (i ? {
    number: i.number,
    title: i.title,
    body: i.body,
    labels: new Set(i.labels),
    state: i.state,
    comments: i.comments,
    createdAt: Date.parse(i.created_at),
    closedAt: i.closed_at ? Date.parse(i.closed_at) : null,
    // The engine's own words: `done`, `obsolete`, or null while it is still open.
    outcome: outcomeOf(i),
    status: statusOf(i),
    origin: originOf(i),
    parked: isParked(i),
    parkKind: parkKindOf(i),
    woken: parseWorkItemBody(i.body ?? '').woken ? Date.parse(parseWorkItemBody(i.body ?? '').woken) : null,
    seeded: i.seeded === true,
    taskId: taskIdOfIssue(i.number),
    qualifier: parseWorkItemTitle(i.title)?.qualifier ?? null,
    sessions: agents.sessions().filter((s) => s.item === i.number),
    raw: i,
  } : undefined);

  const item = (number) => view(github.find(number));
  const family = (taskId) => {
    const [pack, ...rest] = taskId.split('/');
    const title = workItemTitle({ pack, task: rest.join('/') });
    return github.issues().filter((i) => (i.title ?? '').trim() === title).map(view);
  };
  const standingItem = (taskId) => family(taskId).find((i) => i.state === 'open');

  // --- the harness ---------------------------------------------------------

  let started = false;
  const sim = {
    world, log, clock, github, actions, agents, sessions, humans,
    task: (id) => taskOf(id),
    item, family, standingItem,
    get issues() { return github.issues().map(view); },
    get requests() { return github.issues().filter((i) => i.labels.includes(ORIGIN_AD_HOC)).map(view); },
    requestIssue: (n) => item(n),
    requestItems: () => github.issues().filter((i) => parseWorkItemBody(i.body ?? '').request != null).map(view),

    // --- artifact readers: what the engine WROTE, not what a rule says ------
    // A claim is a comment, and its order is the comment id — the same arbiter
    // the lease itself trusts.
    claims: (number) => (github.find(number)?.comments ?? [])
      .filter((c) => c.body.includes(CLAIM_MARKER))
      .map((c) => ({ id: c.id, exec: /executor `([^`]+)`/.exec(c.body)?.[1] ?? null, spent: c.body.includes(EPISODE_MARKER) })),
    heartbeats: (number) => (github.find(number)?.comments ?? []).filter((c) => c.body.includes(HEARTBEAT_MARKER)),
    handoffs: (number) => (github.find(number)?.comments ?? []).filter((c) => c.body.includes(HANDOFF_MARKER)),
    // Why a decline closed an item, off the close comment it wrote.
    declineReason: (number) => {
      const c = (github.find(number)?.comments ?? []).map((x) => /The precondition declined: ([\s\S]*?)(?:\n\n|$)/.exec(x.body)).filter(Boolean).at(-1);
      return c ? c[1].trim() : null;
    },

    // --- the scenario's own timeline ----------------------------------------
    at(isoTime, fn) { clock.at(T(isoTime), () => fn(sim)); return sim; },

    // GitHub drops scheduled fires in [from, to) — the run simply never happens.
    dropSchedulerRuns(fromIso, toIso) { actions.dropFires(T(fromIso), T(toIso)); return sim; },
    // One scheduler run outside the cron grid: a late fire, or somebody pressing
    // the workflow's own button.
    schedulerRunAt(isoTime) {
      clock.at(T(isoTime), () => actions.startRun({
        workflow: SCHEDULER_WORKFLOW_FILE, trigger: 'workflow_dispatch',
        body: schedulerBody(), concurrency: 'claudinite-scheduler', measure: true,
      }).done);
      return sim;
    },

    // An established repo: every scheduled task already ran its previous
    // occurrence, at its cadence's most recent anchor.
    seedSteadyState(asOfIso) {
      const t0 = T(asOfIso);
      for (const task of taskList()) {
        if (task.decl.trigger !== 'schedule') continue;
        const at = previousOccurrence(task, t0);
        github.seedIssue({
          title: workItemTitle({ pack: task.pack, task: task.id }),
          body: workItemBody({ taskPath: task.taskPath }),
          labels: [ORIGIN_PLANNED, STATUS_DONE],
          state: 'closed',
          created_at: new Date(at).toISOString(),
          closed_at: new Date(at + 30 * MINUTE).toISOString(),
          updated_at: new Date(at + 30 * MINUTE).toISOString(),
          seeded: true,
        });
      }
      return sim;
    },

    // --- the levers ----------------------------------------------------------
    // Forcing a task is the scheduler workflow's own `wake` input — the lever the
    // fleet presses and the one a person presses, which are the same lever.
    force(taskId) {
      return actions.startRun({
        workflow: SCHEDULER_WORKFLOW_FILE, trigger: 'workflow_dispatch',
        body: schedulerBody(taskId), concurrency: 'claudinite-scheduler', measure: true,
      }).done;
    },

    // A person creating a work item. Two shapes, and which one it is decides the
    // `Woken:` stamp, exactly as `create-work-item` decides it: the LEVER stamps
    // every item it makes — it exists because somebody asked, which is what the
    // cadence terms read — but it REFUSES an unqualified item of a scheduled task,
    // because that item would BE the standing item. A write-gated person can still
    // open that issue by hand, and nothing stamps the result; that the mutex
    // serializes such a twin, and the cadence judges it over the task's other runs,
    // is what several scenarios are about.
    createItem(taskId, { urgent = false, notBefore = null, blockedBy = [], qualifier = null, eventLost = false } = {}) {
      const task = taskOf(taskId);
      const [pack, ...rest] = taskId.split('/');
      const blocked = notBefore !== null || blockedBy.length > 0;
      const byLever = qualifier !== null || (task && task.decl.trigger !== 'schedule');
      const created = github.seedIssue({
        title: workItemTitle({ pack, task: rest.join('/'), qualifier }),
        body: workItemBody({
          taskPath: task ? task.taskPath : `packs/${pack}/tasks/${rest.join('/')}/task.md`,
          notBefore: notBefore === null ? null : new Date(notBefore).toISOString(),
          blockedBy,
          woken: byLever ? clock.iso() : null,
        }),
        labels: [byLever ? ORIGIN_MANUAL : ORIGIN_PLANNED, blocked ? STATUS_BLOCKED : STATUS_READY, ...(urgent ? [URGENT] : [])],
      });
      if (!blocked) deliverLabelEvent(eventLost);
      return view(created);
    },

    // A stale list let a second standing item through. Injected, because the
    // scheduler cannot produce one against a store that always reads its own writes.
    injectDuplicateStanding(taskId) {
      const task = taskOf(taskId);
      const [pack, ...rest] = taskId.split('/');
      return view(github.seedIssue({
        title: workItemTitle({ pack, task: rest.join('/') }),
        body: workItemBody({ taskPath: task.taskPath }),
        labels: [ORIGIN_PLANNED, STATUS_READY],
      }));
    },

    // An open item left by a FIELDED engine: the old vocabulary on the wire,
    // exactly as stored.
    legacyIssue(taskId, labels, { qualifier = null } = {}) {
      const task = taskOf(taskId);
      const [pack, ...rest] = taskId.split('/');
      return view(github.seedIssue({
        title: workItemTitle({ pack, task: rest.join('/'), qualifier }),
        body: workItemBody({ taskPath: task.taskPath }),
        labels: [...labels],
      }));
    },

    // An issue from another mechanism: present in the repo, outside the queue.
    foreignIssue(title) {
      return view(github.seedIssue({ title, body: 'from somewhere else', labels: ['agent-dispatch'] }));
    },

    // The sanctioned re-queue, exactly as a park's own comment instructs: the
    // status off, ready on, and nothing else written.
    requeue(number) {
      record('requeue', { issue: number, task: taskIdOfIssue(number) });
      return humans.requeue(number).then(() => { deliverLabelEvent(false); return sim; });
    },
    closeByHand(number, reason = 'not_planned') {
      record('close-by-hand', { issue: number });
      return humans.closeIssue(number, { reason }).then(() => sim);
    },
    // An item no live executor can reach (a member whose runner is broken): the
    // issue is there and nothing ever picks it up.
    quarantine(number) { quarantined.add(number); return sim; },

    crashNextExecutionOf(taskId) { crashNext.add(taskId); return sim; },
    crashDuringWorkOf(taskId, minutes) { crashDuringWork.set(taskId, minutes); return sim; },
    crashNextAgentOf(taskId) { crashAgent.add(taskId); return sim; },
    setSignalsUnavailable(taskId, on = true) {
      if (on) signalsUnavailable.add(taskId); else signalsUnavailable.delete(taskId);
      return sim;
    },
    failNextCreateOf(taskId) {
      const [pack, ...rest] = taskId.split('/');
      github.refuseNextIssueCreateTitled(workItemTitle({ pack, task: rest.join('/') }));
      return sim;
    },

    apiRefusedUntil(isoTime) { refusedUntil = T(isoTime); return sim; },
    apiUnansweredOnce({ started: didStart }) { sessions.leaveNextUnanswered({ started: didStart }); return sim; },

    removeTask(taskId) { registry.delete(taskId); return sim; },
    // A declaration change lands at HEAD: the very next scheduler run and the very
    // next pick read the new one — items carry no schedule to migrate.
    updateTask(taskId, patch) {
      const current = registry.get(taskId);
      if (taskId === REQUEST_TASK_ID) {
        // The built-in's declaration is the engine's own file; what a scenario may
        // change about it is how its SESSION behaves.
        Object.assign(current.spec, patch);
      } else {
        registry.delete(taskId);
        addTask({ ...current.spec, ...patch, id: taskId });
      }
      scriptSessions();
      return sim;
    },

    suspendAll() { actions.suspendAll(); record('suspend', {}); return sim; },
    resumeAll() { actions.resumeAll(); record('resume', {}); return sim; },

    // A person marks an ordinary issue. Their prose is the body; the machine block
    // is the scheduler's to write at adoption.
    markIssue({ author = 'owner', model = null, body = 'Please do the thing.', title = 'A thing to do', comments = [] } = {}) {
      const created = github.seedIssue({
        title, labels: [ORIGIN_AD_HOC], user: { login: author },
        body: model ? `${body}\n\nModel: ${model}\n` : body,
      });
      // The blessing is a COMMENT, never the mark: the request signal reads who
      // wrote the approval phrase and asks the permission API about each of them.
      for (const c of comments) {
        created.comments.push({ id: (github.state.commentSeq += 1), body: c.body, created_at: clock.iso(), user: { login: c.login } });
      }
      record('mark', { issue: created.number, author, model });
      return view(created);
    },
    withdrawRequest(number) { return humans.withdrawMark(number).then(() => sim); },
    closeRequestIssue(number) { return humans.closeIssue(number).then(() => sim); },
    // The issue stops existing, and with it the item: one issue, one object.
    deleteRequestIssue(number) { github.deleteIssue(number); return sim; },
    // A transient API failure: the issue is there and still lists, but a read of
    // it by number answers nothing.
    setRequestUnreadable(number, on = true) { github.makeUnreadable(number, on); return sim; },
    // THE ONE RE-ASK LEVER: clear the status, leaving the bare mark, and the next
    // scheduler run re-adopts the same record. A person's edit, so it is refused
    // exactly where a person's edit would change nothing — while a run still holds
    // the issue, the mark already stands and the status says so.
    async remarkIssue(number, { model = null } = {}) {
      const issue = github.find(number);
      const status = statusOf(issue);
      const settled = status === null || status.startsWith(PARK_PREFIX)
        || status === STATUS_DONE || status === STATUS_REJECTED;
      if (!settled) { record('mark', { issue: number, remark: true, refused: 'live' }); return sim; }
      for (const l of issue.labels.filter((x) => STATUS_LABELS.includes(x))) {
        await github.port.removeLabel(null, REPO, number, l);
      }
      if (issue.state !== 'open') await github.port.reopenIssue(null, REPO, number);
      await github.port.addLabel(null, REPO, number, ORIGIN_AD_HOC);
      if (model) {
        await github.port.setIssueBody(null, REPO, number,
          /^Model:.*$/m.test(issue.body) ? issue.body.replace(/^Model:.*$/m, `Model: ${model}`) : `${issue.body}\n\nModel: ${model}\n`);
      }
      record('mark', { issue: number, remark: true });
      return sim;
    },

    // --- multi-executor contention -------------------------------------------
    // Two executor runs starting at the same instant, off the same queue. Nothing
    // is staged: they read the store live, exactly as two runners would, and the
    // claim protocol is what has to sort them out.
    raceExecutorsAt(isoTime, execIds) {
      clock.at(T(isoTime), () => Promise.all(execIds.map((execId) => actions.startRun({
        workflow: EXECUTOR_WORKFLOW_FILE, trigger: 'workflow_dispatch', measure: true,
        env: { CLAUDINITE_EXECUTOR_ID: execId },
        body: ({ run }) => executorBody({ run, id: execId, fired: null }),
      }).done)));
      return sim;
    },

    // --- the cost -----------------------------------------------------------
    // Every workflow RUN is a billed invocation, so a day's cost is the run count.
    // The rows are the Actions ledger's own, and the executor ones are the engine's
    // real `workflow_dispatch` calls turned into runs.
    actionExecutions() {
      const rows = actions.runs();
      const scheduler = rows.filter((r) => r.workflow === SCHEDULER_WORKFLOW_FILE).length;
      const executorRuns = rows.filter((r) => r.workflow === EXECUTOR_WORKFLOW_FILE);
      const executorByTrigger = {};
      for (const e of log.filter((x) => x.kind === 'executor-run' || (x.kind === 'suspended-skip' && x.workflow === 'executor'))) {
        executorByTrigger[e.trigger] = (executorByTrigger[e.trigger] ?? 0) + 1;
      }
      return {
        scheduler, executor: executorRuns.length, executorByTrigger,
        total: scheduler + executorRuns.length,
        billedMinutes: actions.billedMinutes(),
      };
    },

    // Run the clock: the cron grid across the window, a daily janitor, then every
    // event in order.
    async run(fromIso, toIso) {
      const restore = installClock(() => clock.ms());
      try {
        if (!started) { started = true; scriptSessions(); }
        actions.cron(fromIso, toIso, schedulerBody(), { concurrency: 'claudinite-scheduler', measure: true });
        for (let t = Math.ceil(T(fromIso) / DAY) * DAY + 4 * HOUR + 3 * MINUTE; t < T(toIso); t += DAY) {
          if (t >= T(fromIso)) clock.at(t, janitorBody);
        }
        await clock.runUntil(T(toIso));
      } finally { restore(); }
      return sim;
    },
  };

  // The items no executor can reach: the member's runner is broken, and the item
  // simply sits in a queue nothing drains. There is no label for that, so it is
  // modelled where it actually shows — the listing an executor picks from, below.
  const quarantined = new Set();

  // The invocation endpoint's own refusal window, the one fault whose subject is
  // the endpoint rather than the session.
  let refusedUntil = null;
  const rawInvoker = sessions.port.agentInvoker;
  sessions.port.agentInvoker = (opts) => {
    const invoke = rawInvoker(opts);
    return async (call) => {
      if (refusedUntil !== null && clock.ms() < refusedUntil) sessions.refuseNext();
      const out = await invoke(call);
      const fired = sessions.fired().at(-1);
      record(fired?.kind === 'refuse' ? 'handoff-refused'
        : fired?.kind === 'unanswered' ? 'handoff-unanswered' : 'handoff',
      { issue: call.item.number, task: `${call.task.pack}/${call.task.id}` });
      return out;
    };
  };

  // The `labeled` webhook a PERSON's edit fires. The engine's own writes fire none
  // that reaches a workflow — GitHub does not start a run from an event its
  // `GITHUB_TOKEN` created, which is the whole reason the drain job exists.
  function deliverLabelEvent(lost) {
    if (lost) { github.dropNextLabeledEvent(); }
    if (!humans.deliversLabeledEvent()) return;
    clock.after(startLatencyMs, () => actions.startRun({
      workflow: EXECUTOR_WORKFLOW_FILE, trigger: 'issues', measure: true,
      body: ({ run, id }) => executorBody({ run, id, fired: null }),
    }).done);
  }

  // The writes the engine made, classified as they land. Every one of these is an
  // artifact read — a comment's text, a label's name — never a rule's intent.
  github.onWrite((ev) => {
    if (ev.kind === 'addLabel') {
      if (ev.name === STATUS_DONE || ev.name === STATUS_REJECTED) {
        record('close', { issue: ev.issue, task: taskIdOfIssue(ev.issue), outcome: ev.name === STATUS_DONE ? 'done' : 'obsolete' });
      } else if (ev.name.startsWith(PARK_PREFIX)) {
        record('park', { issue: ev.issue, task: taskIdOfIssue(ev.issue), kind: ev.name.slice(PARK_PREFIX.length) });
      }
      return;
    }
    if (ev.body.includes(CLAIM_MARKER)) {
      record('claim', { issue: ev.issue, task: taskIdOfIssue(ev.issue), exec: /executor `([^`]+)`/.exec(ev.body)?.[1] ?? null });
    } else if (ev.body.includes(HEARTBEAT_MARKER)) {
      record('heartbeat', { issue: ev.issue, task: taskIdOfIssue(ev.issue) });
    } else if (/^The precondition declined: /.test(ev.body)) {
      record('decline-close', { issue: ev.issue, task: taskIdOfIssue(ev.issue), reason: /^The precondition declined: ([\s\S]*?)(?:\n\n|$)/.exec(ev.body)[1].trim() });
    } else if (/^Code-work failed: /.test(ev.body)) {
      record('work-failed', { issue: ev.issue, task: taskIdOfIssue(ev.issue) });
    } else if (/opened a PR for you to approve/.test(ev.body) || /pull request is open for review/.test(ev.body)) {
      record('delivered-open-pr', { issue: ev.issue, task: taskIdOfIssue(ev.issue) });
    }
  });

  // A quarantined item is one NO EXECUTOR EVER CLAIMS — a member whose runner is
  // broken, from the queue's point of view. It is hidden from the listings an
  // EXECUTOR RUN reads and from nothing else: the janitor's stale-ready rule exists
  // precisely to notice such an item, so hiding it from the sweep as well would be
  // hiding the thing under test. Applied to the TRANSPORT the run is handed, not to
  // the port object — every stage reaches the store through `gh`, and a port method
  // replaced here is one nothing calls.
  const executorGh = async (path, opts) => {
    const res = await github.gh(path, opts);
    if (!quarantined.size || !Array.isArray(res.json) || !/\/issues\?/.test(path)) return res;
    return { ...res, json: res.json.filter((i) => !quarantined.has(i.number)) };
  };

  // When a task's PREVIOUS occurrence fell, for the steady-state seed. The
  // arithmetic is the engine's own — `taskCadence` reads the cadence term off the
  // declaration and `mostRecentAnchor` resolves it against this repo's schedule —
  // because a seed computed any other way would be seeding a world the terms it is
  // about do not agree with.
  function previousOccurrence(task, t0) {
    const cadence = taskCadence(task.decl);
    if (cadence?.kind === 'due') return mostRecentAnchor(cadence.cadence, CONFIG.taskScheduler, new Date(t0)).getTime();
    if (cadence?.kind === 'elapsed') return t0 - cadence.ms;
    return t0 - DAY;
  }

  return sim;
}
