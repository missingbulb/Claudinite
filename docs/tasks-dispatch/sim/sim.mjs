// A discrete-event simulator of the tasks-dispatch spec (DESIGN.md), so the
// scenario play-throughs in SCENARIOS.md are executable instead of prose-only.
//
// What it models faithfully: virtual time, the tick's three jobs (calendar-only
// instantiation with both guards and the first-item rule, readiness, the
// executing-leash reclaim), the executor loop (pick order, same-title mutex,
// the `after` yield, claim, validate, the single precondition evaluation, the
// roll, the work step/hand-off/converge as timed phases, heartbeat comments
// during the work step so the leash measures executor death rather than work
// duration), at-most-once invocation (one call per item, never retried — the
// fired/refused/unanswered trichotomy of DESIGN §6.6), the readiness re-check
// on close (F1, reopened 2026-08-15), the janitor's stale-ready escalation,
// and the force-is-waking lever. `afterMode: 'blocked-by'` exists solely so
// S24 can demonstrate the starvation that ruled that wiring out.
//
// What it deliberately does NOT model is inventoried in README.md's "The
// unsimulated world" — one row per boundary (cron delivery, list freshness,
// label non-atomicity, comment-id ordering, event delivery, secrets, …) with
// what defends the design there. A bug living exactly on one of those
// boundaries will not surface here; executor contention IS modeled, as
// stale-snapshot races over the claim protocol (raceExecutorsAt).
//
// Time is milliseconds UTC; events run strictly in time order (FIFO within a
// tie). Nothing here sleeps, threads, or reads the wall clock.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const T = (iso) => Date.parse(iso.length === 17 ? iso.replace('Z', ':00Z') : iso);
const iso = (t) => new Date(t).toISOString().slice(0, 16) + 'Z';

// ---- frequency → anchors ----------------------------------------------------
// daily-Nh anchors at N:00Z, plain daily at 04:00Z, hourly at :00, weekly at
// Sunday 04:00Z. mostRecentAnchor is the latest anchor ≤ now; nextAnchor the
// earliest one > now.

// daily-Nh / daily+Nh offset the schedule's daily hour (default 4), per the
// engine's DAILY_OFFSETS: daily-2h → 02:00Z, daily-1h → 03:00Z, daily → 04:00Z.
function anchorHour(frequency) {
  const m = /^daily([+-]\d+)h$/.exec(frequency);
  if (m) return 4 + Number(m[1]);
  if (frequency === 'daily') return 4;
  if (frequency === 'weekly') return 4;
  throw new Error(`no anchor hour for ${frequency}`);
}

export function periodMs(frequency) {
  if (frequency === 'hourly') return HOUR;
  if (frequency === 'weekly') return 7 * DAY;
  return DAY; // daily, daily-Nh
}

export function mostRecentAnchor(frequency, now) {
  if (frequency === 'manual') return null;
  if (frequency === 'hourly') return Math.floor(now / HOUR) * HOUR;
  const d = new Date(now);
  let a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchorHour(frequency));
  if (a > now) a -= DAY;
  if (frequency === 'weekly') {
    while (new Date(a).getUTCDay() !== 0 || a > now) a -= DAY;
  }
  return a;
}

export function nextAnchor(frequency, now) {
  let a = mostRecentAnchor(frequency, now);
  do a += periodMs(frequency); while (a <= now);
  return a;
}

// ---- the simulator ----------------------------------------------------------

export function makeSim({
  tasks,
  afterMode = 'yield', // 'yield' (the design) | 'blocked-by' (S24's rejected wiring)
  tickMinute = 17,
  executingLeashMs = 1 * HOUR,
  agentLeashMs = 3 * HOUR,
  heartbeatMinutes = 15, // the executor's activity comment cadence during the work step
  pickSeed = 1, // seed for the randomized pick order, so scenarios replay identically
  staleReadyPeriods = 2,
  staleBlockedMs = 2 * DAY,
  heartbeatsDisabled = false, // S31b only: demonstrate the livelock heartbeats prevent
} = {}) {
  const registry = new Map(tasks.map((t) => [t.id, t]));
  const titleOf = (id) => `[claudinite-work] ${id}`;

  // F17, reframed by the work-as-work review (2026-08-15): the leash no longer
  // has to exceed every task's work bound — heartbeat comments during the work
  // step keep a LIVE executor's item out of the reclaim, however long the work
  // runs, so the leash measures executor death, not work duration. The wiring
  // constraint that remains is the one the heartbeat itself needs: the
  // heartbeat interval must sit well inside the leash, or every heartbeat
  // arrives too late to matter.
  if (heartbeatMinutes * MIN >= executingLeashMs) {
    throw new Error(
      `heartbeat interval (${heartbeatMinutes}m) reaches the executing leash — F17 (reframed)`);
  }

  const issues = []; // {number,title,taskId,origin,labels:Set,state,createdAt,closedAt,readySince,lastActivity,notBefore,blockedBy:[],outcome,rolls:[],comments:[],escalated,sessions:[],quarantined}
  const log = []; // {t,kind,task,issue,...}
  const world = {}; // scenario-owned signal state, read by precondition fns
  const queue = []; // {t,seq,fn}
  let seq = 0;
  let now = 0;
  let sessionSeq = 0;
  // Randomized pick order (owner, 2026-08-15) wants randomness; reproducible
  // tests want determinism. A seeded LCG gives both.
  let prngState = pickSeed >>> 0;
  const prng = () => (prngState = (prngState * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  // CLAUDINITE_TASKS_SUSPEND_ALL (owner, 2026-08-16): a repo Actions variable
  // every Claudinite workflow checks as its FIRST act — when true, the run
  // exits cleanly and fires nothing, so the train parks at most one hop after
  // suspension. Gates workflow STARTS only: in-flight runs and agent sessions
  // finish on their own, and items freeze in place with no labels touched.
  let suspendedAll = false;
  const crashNextOf = new Set(); // taskIds whose next execution dies mid-claim
  const crashDuringWorkOf = new Map(); // taskId -> minutes into the work step the runner dies
  const crashAgentOf = new Set(); // taskIds whose next agent session dies mid-run

  const schedule = (t, fn) => queue.push({ t, seq: seq++, fn });
  const record = (kind, extra) => log.push({ t: now, at: iso(now), kind, ...extra });

  const open = () => issues.filter((i) => i.state === 'open');
  const has = (i, l) => i.labels.has(l);
  const family = (taskId) =>
    issues.filter((i) => i.title === titleOf(taskId) && i.origin === 'schedule');
  const standingItem = (taskId) => family(taskId).find((i) => i.state === 'open');

  function createIssue({ taskId, origin, labels, notBefore = null, blockedBy = [], urgent = false, qualifier = null }) {
    const it = {
      number: issues.length + 900,
      title: titleOf(taskId) + (qualifier ? ` ${qualifier}` : ''),
      taskId, origin,
      labels: new Set(labels.concat(urgent ? ['task:urgent'] : [])),
      state: 'open',
      createdAt: now, closedAt: null,
      readySince: labels.includes('task:ready') ? now : null,
      lastActivity: now,
      notBefore, blockedBy,
      outcome: null, rolls: [], comments: [], escalated: false,
      sessions: [], quarantined: false,
    };
    issues.push(it);
    record('create', { task: taskId, issue: it.number, origin });
    return it;
  }

  function swap(it, from, to) {
    it.labels.delete(from);
    it.labels.add(to);
    it.readySince = to === 'task:ready' ? now : null;
    // F18: every transition INTO ready opens a new claim episode — claim
    // comments from a previous tenure are dead and must not outrank a live
    // claimant (the revert/reclaim comment is the episode boundary)
    if (to === 'task:ready') it.claimEpoch = seq++;
    it.lastActivity = now;
  }

  function close(it, outcome) {
    it.state = 'closed';
    it.closedAt = now;
    it.outcome = outcome;
    for (const l of [...it.labels]) if (l.startsWith('task:')) it.labels.delete(l);
    record('close', { task: it.taskId, issue: it.number, outcome });
    // F1, reopened 2026-08-15: whoever closes an item — executor or agent —
    // also re-checks blocked items' readiness in code (Blocked-by all closed,
    // Not-before passed) and a drain follows, so chain links proceed in
    // minutes instead of waiting out the tick. The tick's readiness job stays
    // the backstop; a HAND close runs no engine code and is covered by it.
    for (const b of open().filter((i) => has(i, 'task:blocked'))) {
      const blockersDone = b.blockedBy.every(
        (n) => issues.find((x) => x.number === n)?.state === 'closed'
      );
      if (blockersDone && (b.notBefore === null || now >= b.notBefore)) {
        swap(b, 'task:blocked', 'task:ready');
        record('ready', { task: b.taskId, issue: b.number, by: 'close' });
      }
    }
    if (pickable().length > 0) {
      schedule(now + 1 * MIN, () => executorRun('E1', 'close-drain'));
    }
  }

  // ---- the tick (DESIGN §5): pure function of the clock and the issue list --
  function tick() {
    if (suspendedAll) { record('suspended-skip', { workflow: 'tick' }); return; }
    record('tick', {});
    // job 1: instantiate — calendar-only, no preconditions, no signals
    for (const task of registry.values()) {
      if (task.frequency === 'manual') continue;
      const A = mostRecentAnchor(task.frequency, now);
      const fam = family(task.id);
      // F16 self-heal: if a stale issue list ever let a duplicate standing
      // item through (nothing guarantees a REST list from another node sees a
      // creation seconds old), close every open one but the oldest. The tick
      // is serialized (concurrency group), so this cannot race itself.
      const openFam = fam.filter((i) => i.state === 'open')
        .sort((a, b) => a.number - b.number);
      for (const dup of openFam.slice(1)) {
        close(dup, 'obsolete');
        record('dedupe', { task: task.id, issue: dup.number });
      }
      if (openFam.length > 0) continue; // standing item exists
      // occurrence guard, both halves (F13): an item CREATED at-or-after A
      // covers this occurrence — and so does an item CLOSED at-or-after A,
      // because a rolled item created in an earlier period that ran today
      // consumed today's occurrence. Creation-time alone double-executes.
      if (fam.some((i) => i.createdAt >= A || (i.closedAt ?? -Infinity) >= A)) continue;
      const firstEver = fam.length === 0;
      const blockedByUp =
        afterMode === 'blocked-by'
          ? (task.after ?? []).map((up) => standingItem(up)?.number).filter(Boolean)
          : [];
      const born = firstEver || blockedByUp.length > 0 ? 'task:blocked' : 'task:ready';
      createIssue({
        taskId: task.id, origin: 'schedule',
        labels: ['origin:schedule', born],
        notBefore: firstEver ? nextAnchor(task.frequency, now) : null,
        blockedBy: blockedByUp,
      });
    }
    // job 2: ready whatever is due
    for (const it of open().filter((i) => has(i, 'task:blocked'))) {
      const blockersDone = it.blockedBy.every(
        (n) => issues.find((x) => x.number === n)?.state === 'closed'
      );
      if (blockersDone && (it.notBefore === null || now >= it.notBefore)) {
        swap(it, 'task:blocked', 'task:ready');
        record('ready', { task: it.taskId, issue: it.number });
      }
    }
    // job 3: reclaim dead executor claims
    for (const it of open().filter((i) => has(i, 'task:executing'))) {
      if (now - it.lastActivity >= executingLeashMs) {
        swap(it, 'task:executing', 'task:ready');
        it.comments.push({ t: now, body: 'reclaimed: executor went silent past the leash' });
        record('reclaim', { task: it.taskId, issue: it.number });
      }
    }
  }

  // ---- the executor (DESIGN §6) ---------------------------------------------
  function pickable() {
    const ready = open().filter((i) => has(i, 'task:ready'));
    const live = (taskId) => {
      const s = standingItem(taskId);
      return s && ['task:ready', 'task:executing', 'task:agent'].some((l) => has(s, l));
    };
    return ready
      .filter((i) => !i.quarantined) // an item no live executor can reach (S18)
      .filter((i) => {
        // same-title mutex: one task, one execution at a time
        if (open().some((o) => o !== i && o.title === i.title &&
              (has(o, 'task:executing') || has(o, 'task:agent')))) return false;
        // the `after` yield: skip while the upstream's standing item is live
        // this cycle (a rolled or needs-human upstream does not block — S23)
        if (afterMode === 'yield' && i.origin === 'schedule') {
          const ups = registry.get(i.taskId)?.after ?? [];
          if (ups.some((up) => live(up))) return false;
        }
        return true;
      })
      .map((i) => ({ i, r: prng() }))
      // urgent first, then RANDOM among the ready (owner, 2026-08-15) — two
      // executors listing the same queue then contend on DIFFERENT heads, and
      // nothing leaned on oldest-first: the stale-ready escalation is
      // period-scale, indifferent to minute-scale pick reordering
      .sort((a, b) =>
        (has(b.i, 'task:urgent') ? 1 : 0) - (has(a.i, 'task:urgent') ? 1 : 0) ||
        a.r - b.r)
      .map(({ i }) => i);
  }

  // The claim is the verified lease (DESIGN §6.2): swap, post a claim
  // comment, re-read — earliest comment wins, the loser reverts nothing and
  // moves on. `preRead` is the label state the executor saw when it read the
  // item; a racing executor's stale read is modeled by passing the snapshot
  // taken before the rival's swap landed.
  function claim(it, execId, preRead) {
    if (!preRead.has('task:ready') || preRead.has('needs-human') ||
        preRead.has('task:executing') || preRead.has('task:agent')) return false;
    it.labels.delete('task:ready');
    it.labels.add('task:executing');
    it.readySince = null;
    it.lastActivity = now;
    it.comments.push({ t: now, seq: seq++, kind: 'claim', exec: execId });
    // F18: arbitrate only among THIS episode's claims — earliest since the
    // item last became ready, by server-assigned comment order
    const claims = it.comments.filter((c) => c.kind === 'claim' && c.seq > (it.claimEpoch ?? -1));
    const won = claims[0].exec === execId;
    record(won ? 'claim' : 'claim-lost', { task: it.taskId, issue: it.number, exec: execId });
    return won; // loser reverts nothing — the winner's labels already stand
  }

  // Hand-off + invocation (DESIGN §6.6, as amended 2026-08-15): swap to
  // task:agent, then fire the endpoint EXACTLY ONCE — never retried, because a
  // retry is only safe when the first call is known to have done nothing, and
  // the unanswered case is exactly where nothing can be known. Three outcomes:
  //  - fired      → a session exists; the item is the agent's
  //  - refused    → a status came back, no session exists and none will (a
  //                 token / URL / routine is wrong, which no retry fixes):
  //                 converge needs-human naming the cause
  //  - unanswered → the session may or may not exist and nothing may guess:
  //                 the item STAYS task:agent with the outcome-unknown comment;
  //                 a session that started converges it, one that never did
  //                 leaves it silent until the janitor's agent leash (§11)
  // At-most-once invocation is what deleted the agent-side claim lease: two
  // sessions can never arrive at one item, so there is nothing to arbitrate.
  function handOff(it, task) {
    swap(it, 'task:executing', 'task:agent');
    if (world._apiRefusedUntil != null && now < world._apiRefusedUntil) {
      record('handoff-refused', { task: it.taskId, issue: it.number });
      swap(it, 'task:agent', 'needs-human');
      return;
    }
    if (world._apiUnanswered) {
      const { started } = world._apiUnanswered;
      world._apiUnanswered = null;
      record('handoff-unanswered', { task: it.taskId, issue: it.number, started });
      it.comments.push({ t: now, body: 'invocation got no answer — outcome unknown, the agent leash decides' });
      if (!started) return; // silent item; the janitor's agent leash is the recovery
      const s = { id: `s-${++sessionSeq}`, item: it.number };
      it.sessions.push(s);
      schedule(now + 30_000, () => startAgentSession(s, it, task));
      return;
    }
    record('handoff', { task: it.taskId, issue: it.number });
    const s = { id: `s-${++sessionSeq}`, item: it.number };
    it.sessions.push(s);
    schedule(now + 30_000, () => startAgentSession(s, it, task));
  }

  function startAgentSession(s, it, task) {
    if (it.state !== 'open' || !has(it, 'task:agent')) return;
    // No agent-side claim (DESIGN §7, amended 2026-08-15): the session checks,
    // not claims — the item wears task:agent and the fire's nonce matches the
    // newest hand-off, both modeled by the guard above.
    it.lastActivity = now;
    if (crashAgentOf.delete(it.taskId)) {
      record('agent-died', { task: it.taskId, issue: it.number, session: s.id });
      return; // never converges; the janitor's agent leash is the recovery (S11)
    }
    schedule(now + task.agentMinutes * MIN, () => {
      if (it.state !== 'open') return;
      if (task.agentFails?.(world, now)) {
        swap(it, 'task:agent', 'needs-human');
        record('agent-failed', { task: it.taskId, issue: it.number });
        return;
      }
      close(it, task.outcome ?? 'done');
    });
  }

  // One claimed item through to its settle. `onSettled` is the RUN's
  // continuation — called when the item stops occupying this executor (roll,
  // close, hand-off, work failure), and deliberately NOT called when the
  // runner itself dies (the run died with it; the leash is the recovery).
  // The hand-off settles the item for the run: the executor never waits for
  // the agent, which is why agent work parallelizes and executor work is the
  // occupancy (DESIGN §10).
  function executeClaimed(it, task, onSettled = () => {}) {
    if (crashNextOf.delete(it.taskId)) {
      record('executor-crash', { task: it.taskId, issue: it.number });
      // The workflow's failure-continuation job (needs: execute, if:
      // failure() || cancelled()) re-dispatches on a fresh runner, so a dead
      // run never stalls the train — the crashed ITEM still waits for the
      // leash reclaim; only the QUEUE keeps moving (S36).
      schedule(now + 1 * MIN, () => executorRun('E-failover', 'failure-redispatch'));
      return; // died mid-claim: labels stay, the leash reclaim recovers (S8)
    }
    // the single precondition evaluation (DESIGN §6.4)
    const verdict = task.precondition ? task.precondition(world, now) : { run: true };
    record('evaluate', { task: it.taskId, issue: it.number, run: verdict.run !== false });
    if (verdict.run === false) {
      if (it.origin === 'schedule') { // roll
        it.notBefore = nextAnchor(task.frequency, now);
        it.rolls.push({ t: now, reason: verdict.reason ?? 'no work' });
        swap(it, 'task:executing', 'task:blocked');
        record('roll', { task: it.taskId, issue: it.number, until: iso(it.notBefore) });
      } else {
        close(it, 'obsolete'); // ad-hoc: no anchor to roll to (S17)
      }
      onSettled();
      return;
    }
    // the work step → optional hand-off → converge, as timed phases. The
    // executor re-verifies its OWN lease at the transition (F17): not just "is
    // the item executing" but "is my claim still the newest" — a reclaim-then-
    // re-pick puts a newer claim on the item, and the stale runner must see
    // it and abandon silently rather than hand off work it no longer owns.
    const myClaim = it.comments.filter((c) => c.kind === 'claim').at(-1);
    const mineStill = () => it.state === 'open' && has(it, 'task:executing') &&
      it.comments.filter((c) => c.kind === 'claim').at(-1) === myClaim;
    const workMs = (task.preworkMinutes ?? 1) * MIN;
    const diesAtMin = crashDuringWorkOf.has(it.taskId)
      ? crashDuringWorkOf.get(it.taskId) : null;
    if (diesAtMin !== null) crashDuringWorkOf.delete(it.taskId);
    // Heartbeat comments during the work step (work-as-work review,
    // 2026-08-15): the executor touches the item every heartbeatMinutes, so
    // the leash reclaims a DEAD executor within ~leash regardless of how long
    // the work legally runs — and the item's timeline shows live progress
    // instead of going dark for the duration.
    if (!heartbeatsDisabled) {
      for (let m = heartbeatMinutes; m * MIN < workMs; m += heartbeatMinutes) {
        if (diesAtMin !== null && m >= diesAtMin) break;
        schedule(now + m * MIN, () => {
          if (!mineStill()) return;
          it.lastActivity = now;
          record('heartbeat', { task: it.taskId, issue: it.number });
        });
      }
    }
    if (diesAtMin !== null) {
      // the runner dies mid-work: heartbeats stop, the completion never runs,
      // and the leash reclaims from the LAST heartbeat — recovery is bounded
      // by the leash, not by the work's duration
      schedule(now + diesAtMin * MIN, () => {
        record('executor-crash', { task: it.taskId, issue: it.number });
        // the failure-continuation job fires here too — timeout, cancellation
        // and runner loss all run the needs:execute/if:failure() job (S36)
        schedule(now + 1 * MIN, () => executorRun('E-failover', 'failure-redispatch'));
      });
      return; // the run dies with the runner — no settle, no ordinary re-dispatch
    }
    schedule(now + workMs, () => {
      if (!mineStill()) return; // reclaimed while (presumed) dead: the run is gone
      it.lastActivity = now;
      if (task.preworkFails?.(world, now)) {
        swap(it, 'task:executing', 'needs-human');
        record('work-failed', { task: it.taskId, issue: it.number });
        onSettled();
        return;
      }
      const wantsAgent = task.agentMinutes != null &&
        (task.requestsAgent ? task.requestsAgent(world, now) : true);
      if (!wantsAgent) { close(it, task.outcome ?? 'done'); onSettled(); return; }
      handOff(it, task);
      onSettled(); // the hand-off ends the executor's occupancy, not the item
    });
  }

  // F15: the pick filters (same-title mutex, `after` yield) are read from
  // possibly-stale state, so two executors can pass them simultaneously and
  // claim DIFFERENT items that the filters should have serialized — a twin
  // pair, or an upstream and its dependent. The lease protects one item, not
  // one title. So after WINNING a claim, re-verify the filters against live
  // state: if a conflicting item now holds an EARLIER claim (comment order —
  // the same arbiter the lease trusts), revert this claim to task:ready and
  // move on. Bounded (one revert), deterministic (comment order), and the
  // earlier claim never even notices.
  function postClaimVerify(it, execId) {
    const myClaim = it.comments.filter((c) => c.kind === 'claim').at(-1);
    const conflicts = open().filter((o) => {
      if (o === it) return false;
      const live = has(o, 'task:executing') || has(o, 'task:agent');
      if (!live) return false;
      if (o.title === it.title) return true; // twin
      if (afterMode === 'yield' && it.origin === 'schedule') {
        const ups = registry.get(it.taskId)?.after ?? [];
        if (ups.some((up) => o.title === titleOf(up) && o.origin === 'schedule')) return true;
      }
      return false;
    });
    const earlier = conflicts.some((o) =>
      o.comments.filter((c) => c.kind === 'claim').at(-1)?.seq < myClaim.seq);
    if (!earlier) return true;
    swap(it, 'task:executing', 'task:ready');
    record('claim-reverted', { task: it.taskId, issue: it.number, exec: execId });
    return false;
  }

  // One executor RUN — a workflow run in the real deployment — performs ONE
  // item. Not a configured maximum: the essence of the executor (owner,
  // 2026-08-15). The run claims an item, sees it through to its settle (roll,
  // close, hand-off, failure), and ends; if the queue still has pickable
  // items it RE-DISPATCHES a fresh run (`workflow_dispatch`, which the
  // default GITHUB_TOKEN may fire), so the queue drains run by run and a
  // run's timeout sizes to a single work bound. Every run records its
  // trigger — tick-drain | label-event | close-drain | re-dispatch |
  // failure-redispatch — so tests assert WHAT caused each run, not just that
  // items converged.
  let runSeq = 0;
  function executorRun(execId = 'E1', trigger = 'label-event') {
    if (suspendedAll) { record('suspended-skip', { workflow: 'executor', trigger }); return; }
    const runId = `R${++runSeq}`;
    record('executor-run', { run: runId, exec: execId, trigger });
    const settle = () => {
      record('run-end', { run: runId, exec: execId, trigger, settled: 1 });
      if (pickable().length > 0) {
        schedule(now + 1 * MIN, () => executorRun(execId, 're-dispatch'));
      }
    };
    const step = () => { // claim attempts until one item is held, or the queue is empty
      const it = pickable()[0];
      if (!it) { record('run-end', { run: runId, exec: execId, trigger, settled: 0 }); return; }
      if (!claim(it, execId, new Set(it.labels))) return step(); // loser tries another item
      if (!postClaimVerify(it, execId)) return step();
      const task = registry.get(it.taskId);
      if (!task) { close(it, 'obsolete'); return settle(); } // validate: task gone (S20)
      record('pick', { run: runId, exec: execId, task: it.taskId, issue: it.number });
      executeClaimed(it, task, settle);
    };
    step();
  }

  // ---- the janitor (DESIGN §11): the judgment-and-long-horizon sweeps -------
  function janitor() {
    if (suspendedAll) { record('suspended-skip', { workflow: 'janitor' }); return; }
    // rule A — stale-ready: an item no executor picked for ~2 periods comes
    // out of the queue as a human's problem (S18's stuck member)
    for (const it of open().filter((i) => has(i, 'task:ready') && !i.escalated)) {
      const per = registry.has(it.taskId) ? periodMs(registry.get(it.taskId).frequency) : DAY;
      if (it.readySince !== null && now - it.readySince >= staleReadyPeriods * per) {
        it.escalated = true;
        swap(it, 'task:ready', 'needs-human');
        record('escalate', { task: it.taskId, issue: it.number, rule: 'stale-ready' });
      }
    }
    // rule B — the agent leash: task:agent silent past ~3h means the session
    // died; converge needs-human, naming the dead session (S11)
    for (const it of open().filter((i) => has(i, 'task:agent'))) {
      if (now - it.lastActivity >= agentLeashMs) {
        const dead = it.sessions.at(-1)?.id ?? 'unknown';
        swap(it, 'task:agent', 'needs-human');
        it.comments.push({ t: now, body: `agent session ${dead} went silent past the leash` });
        record('agent-reclaim', { task: it.taskId, issue: it.number, session: dead });
      }
    }
    // rule C — stuck dependency (F14): a blocked item whose blockers have not
    // resolved for ~2 days is surfaced with an escalation COMMENT — labels
    // stay untouched, so the item still proceeds by itself the moment its
    // blockers resolve. Sleeping items (future Not-before, blockers closed)
    // and rolling items (no blockers) never match.
    for (const it of open().filter((i) => has(i, 'task:blocked') && !i.escalated)) {
      const blocked = it.blockedBy.some((n) => issues.find((x) => x.number === n)?.state !== 'closed');
      if (blocked && now - it.createdAt >= staleBlockedMs) {
        it.escalated = true;
        it.comments.push({ t: now, body: 'stuck: blockers unresolved past the bound' });
        record('escalate', { task: it.taskId, issue: it.number, rule: 'stuck-dependency' });
      }
    }
  }

  // ---- the scenario DSL -----------------------------------------------------
  const droppedTicks = [];
  const sim = {
    issues, log, world,
    family, standingItem,

    // "at time X, Y happens"
    at(isoTime, fn) { schedule(T(isoTime), () => fn(sim)); return sim; },

    // GitHub drops scheduled fires in [from, to) — the ticks simply don't run
    dropTicks(fromIso, toIso) { droppedTicks.push([T(fromIso), T(toIso)]); return sim; },
    // one late/manual tick outside the cron grid (with its post-tick drain)
    tickAt(isoTime) {
      schedule(T(isoTime), tick);
      schedule(T(isoTime) + 40_000, () => executorRun('E1', 'tick-drain'));
      return sim;
    },

    // an established repo: every scheduled task already ran its previous
    // occurrence (a closed done item), so the first-item rule doesn't apply
    seedSteadyState(asOfIso) {
      const t0 = T(asOfIso);
      for (const task of registry.values()) {
        if (task.frequency === 'manual') continue;
        const a = mostRecentAnchor(task.frequency, t0);
        issues.push({
          number: issues.length + 800, title: titleOf(task.id), taskId: task.id,
          origin: 'schedule', labels: new Set(['origin:schedule']), state: 'closed',
          createdAt: a, closedAt: a + 30 * MIN, readySince: null, lastActivity: a,
          notBefore: null, blockedBy: [], outcome: 'done', rolls: [], comments: [],
          escalated: false, seeded: true,
        });
      }
      return sim;
    },

    // forcing a scheduled task = waking its standing item (DESIGN §8)
    force(taskId, { urgent = true } = {}) {
      const it = standingItem(taskId);
      if (!it) throw new Error(`no standing item for ${taskId}`);
      it.notBefore = null;
      if (has(it, 'task:blocked')) swap(it, 'task:blocked', 'task:ready');
      if (has(it, 'needs-human')) { it.labels.delete('needs-human'); it.labels.add('task:ready'); it.readySince = now; it.claimEpoch = seq++; }
      if (urgent) it.labels.add('task:urgent');
      record('force', { task: taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun('E1', 'label-event')); // the labeled event's latency sugar
      return it;
    },

    // ad-hoc work is creating an item (DESIGN §8) — origin manual.
    // eventLost models a dropped `labeled` webhook (S16): no immediate
    // executor run fires; the next tick's drain is the guarantee.
    createItem(taskId, { urgent = false, notBefore = null, blockedBy = [], qualifier = null, eventLost = false } = {}) {
      const born = notBefore !== null || blockedBy.length ? 'task:blocked' : 'task:ready';
      const it = createIssue({ taskId, origin: 'manual', labels: [born], notBefore, blockedBy, urgent, qualifier });
      if (born === 'task:ready' && !eventLost) schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
      return it;
    },

    crashNextExecutionOf(taskId) { crashNextOf.add(taskId); return sim; },
    // the runner dies `minutes` INTO the work step: heartbeats until then, none
    // after, completion never runs — the leash-from-last-heartbeat recovery
    crashDuringWorkOf(taskId, minutes) { crashDuringWorkOf.set(taskId, minutes); return sim; },
    crashNextAgentOf(taskId) { crashAgentOf.add(taskId); return sim; },

    // the task file disappears from HEAD (S20): validate-in-code closes obsolete
    removeTask(taskId) { registry.delete(taskId); return sim; },

    // a declaration change lands at HEAD (S28): the very next tick/pick reads
    // the new frequency/after/precondition — items carry no schedule to migrate
    updateTask(taskId, patch) {
      registry.set(taskId, { ...registry.get(taskId), ...patch });
      return sim;
    },

    // an issue from another mechanism/vocabulary (S29): present in the repo,
    // outside the [claudinite-work] family — the tick must never touch it
    foreignIssue(title) {
      const it = {
        number: issues.length + 700, title, taskId: null, origin: 'foreign',
        labels: new Set(['agent-dispatch']), state: 'open',
        createdAt: now, closedAt: null, readySince: null, lastActivity: now,
        notBefore: null, blockedBy: [], outcome: null, rolls: [], comments: [],
        escalated: false, sessions: [],
        quarantined: false,
      };
      issues.push(it);
      return it;
    },

    // ---- multi-executor contention (S7) ------------------------------------
    // Two executors read the SAME snapshot of the ready list, so both pick
    // the same first item; both swap and post claim comments; the earliest
    // comment wins and the loser moves on to the next item read from LIVE
    // state — the verified lease, stale-read and all (DESIGN §6.2).
    // spread: false (default) — both executors pick the SAME first item (S7's
    // one-item race). spread: true — executor i picks snapshot[i]: different
    // items, claimed simultaneously from the same stale read, which is how a
    // twin pair or an upstream+dependent slip past the pick filters together
    // (S32/F15) — only the post-claim re-verify serializes them.
    raceExecutorsAt(isoTime, execIds, { spread = false } = {}) {
      schedule(T(isoTime), () => {
        const snapshot = pickable();
        const preReads = new Map(snapshot.map((i) => [i, new Set(i.labels)]));
        const winners = [];
        execIds.forEach((execId, k) => {
          const target = spread ? snapshot[k] : snapshot[0];
          if (!target) return;
          if (claim(target, execId, preReads.get(target))) winners.push([target, execId]);
          else executorRun(execId); // same-item loser moves on, from live state
        });
        for (const [target, execId] of winners) {
          if (!postClaimVerify(target, execId)) continue;
          const task = registry.get(target.taskId);
          if (task) executeClaimed(target, task);
        }
      });
      return sim;
    },

    // F16's precondition: a tick whose issue list was stale created a second
    // standing item. Injected directly — the sim's own tick can't produce it.
    injectDuplicateStanding(taskId) {
      return createIssue({ taskId, origin: 'schedule', labels: ['origin:schedule', 'task:ready'] });
    },

    // ---- platform failure injection (S9/S10) -------------------------------
    // refused: the endpoint answers with an error status — no session exists
    apiRefusedUntil(isoTime) { world._apiRefusedUntil = T(isoTime); return sim; },
    // unanswered: timeout/dropped connection — `started` says whether the call
    // actually created a session on the far side (the executor cannot know)
    apiUnansweredOnce({ started }) { world._apiUnanswered = { started }; return sim; },

    // ---- fleet / human levers ----------------------------------------------
    quarantine(number) { issues.find((i) => i.number === number).quarantined = true; return sim; },
    closeByHand(number, outcome = 'obsolete') {
      const it = issues.find((i) => i.number === number);
      it.state = 'closed'; it.closedAt = now; it.outcome = outcome;
      for (const l of [...it.labels]) if (l.startsWith('task:') || l === 'needs-human') it.labels.delete(l);
      record('close', { task: it.taskId, issue: it.number, outcome, by: 'hand' });
      return sim;
    },
    // the operator hold (DESIGN §8): set/clear the suspend-all variable. Resume
    // needs no dispatch of its own — the next cron tick self-heals — but the
    // impatient path is a hand-dispatched scheduler run (tickAt models it).
    suspendAll() { suspendedAll = true; record('suspend', {}); return sim; },
    resumeAll() { suspendedAll = false; record('resume', {}); return sim; },

    // the sanctioned human re-queue (F7, DESIGN §4): strip needs-human,
    // apply task:ready — the same lever forcing uses
    requeue(number) {
      const it = issues.find((i) => i.number === number);
      it.labels.delete('needs-human');
      it.labels.delete('task:blocked');
      it.notBefore = null;
      it.labels.add('task:ready');
      it.readySince = now;
      it.claimEpoch = seq++;
      it.lastActivity = now;
      record('requeue', { task: it.taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
      return sim;
    },

    // run the clock: hourly ticks at :tickMinute (each with its post-tick
    // drain), a daily janitor, then drain the event queue strictly in order
    run(fromIso, toIso) {
      const from = T(fromIso), to = T(toIso);
      for (let t = Math.ceil(from / HOUR) * HOUR + tickMinute * MIN; t < to; t += HOUR) {
        if (t < from) continue;
        if (droppedTicks.some(([a, b]) => t >= a && t < b)) continue;
        schedule(t, tick);
        schedule(t + 40_000, () => executorRun('E1', 'tick-drain'));
      }
      for (let t = Math.ceil(from / DAY) * DAY + 4 * HOUR + 3 * MIN; t < to; t += DAY) {
        if (t >= from) schedule(t, janitor);
      }
      for (;;) {
        queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
        const ev = queue.shift();
        if (!ev || ev.t >= to) break;
        now = ev.t;
        ev.fn();
      }
      now = to;
      return sim;
    },
  };
  return sim;
}
