// A discrete-event simulator of the tasks-dispatch spec (DESIGN.md), so the
// scenario play-throughs in SCENARIOS.md are executable instead of prose-only.
//
// What it models faithfully: virtual time, the tick's three jobs (calendar-only
// instantiation with both guards and the first-item rule, readiness, the
// executing-leash reclaim), the executor loop (pick order, same-title mutex,
// the `after` yield, claim, validate, the single precondition evaluation, the
// roll, prework/hand-off/converge as timed phases), the janitor's stale-ready
// escalation, and the force-is-waking lever. `afterMode: 'blocked-by'` exists
// solely so S24 can demonstrate the starvation that ruled that wiring out.
//
// What it deliberately does NOT model (say what it can't catch): search-index
// lag (the store IS the REST list), API races between concurrent executors
// (one deterministic executor; the lease protocol's own races are argued in
// DESIGN §6/§7, not here), token/permission surfaces, and real prework
// content. A bug living exactly on those boundaries will not surface here.
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
  staleReadyPeriods = 2,
  staleBlockedMs = 2 * DAY,
} = {}) {
  const registry = new Map(tasks.map((t) => [t.id, t]));
  const titleOf = (id) => `[claudinite-work] ${id}`;

  const issues = []; // {number,title,taskId,origin,labels:Set,state,createdAt,closedAt,readySince,lastActivity,notBefore,blockedBy:[],outcome,rolls:[],comments:[],escalated,sessions:[],agentClaims:[],handoffAttempts,quarantined}
  const log = []; // {t,kind,task,issue,...}
  const world = {}; // scenario-owned signal state, read by precondition fns
  const queue = []; // {t,seq,fn}
  let seq = 0;
  let now = 0;
  let sessionSeq = 0;
  const crashNextOf = new Set(); // taskIds whose next execution dies mid-claim
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
      sessions: [], agentClaims: [], handoffAttempts: 0, quarantined: false,
    };
    issues.push(it);
    record('create', { task: taskId, issue: it.number, origin });
    return it;
  }

  function swap(it, from, to) {
    it.labels.delete(from);
    it.labels.add(to);
    it.readySince = to === 'task:ready' ? now : null;
    it.lastActivity = now;
  }

  function close(it, outcome) {
    it.state = 'closed';
    it.closedAt = now;
    it.outcome = outcome;
    for (const l of [...it.labels]) if (l.startsWith('task:')) it.labels.delete(l);
    record('close', { task: it.taskId, issue: it.number, outcome });
  }

  // ---- the tick (DESIGN §5): pure function of the clock and the issue list --
  function tick() {
    record('tick', {});
    // job 1: instantiate — calendar-only, no preconditions, no signals
    for (const task of registry.values()) {
      if (task.frequency === 'manual') continue;
      const A = mostRecentAnchor(task.frequency, now);
      const fam = family(task.id);
      if (fam.some((i) => i.state === 'open')) continue; // standing item exists
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
      .sort((a, b) =>
        (has(b, 'task:urgent') ? 1 : 0) - (has(a, 'task:urgent') ? 1 : 0) ||
        a.createdAt - b.createdAt || a.number - b.number);
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
    const claims = it.comments.filter((c) => c.kind === 'claim');
    const won = claims[0].exec === execId;
    record(won ? 'claim' : 'claim-lost', { task: it.taskId, issue: it.number, exec: execId });
    return won; // loser reverts nothing — the winner's labels already stand
  }

  // Hand-off + invocation (DESIGN §6.6): swap to task:agent, then call the
  // API. Failure after in-run retries reverts to task:ready with an attempt
  // counter (F3); at 5 attempts the item converges needs-human. A client
  // timeout that still created a session makes invocation at-least-once
  // (S10): the retry spawns a second session, and the agent-side lease (F5,
  // DESIGN §7) — earliest agent claim comment wins — collapses the pair.
  function handOff(it, task) {
    swap(it, 'task:executing', 'task:agent');
    if (world._apiDownUntil != null && now < world._apiDownUntil) {
      it.handoffAttempts += 1;
      record('handoff-failed', { task: it.taskId, issue: it.number, attempts: it.handoffAttempts });
      if (it.handoffAttempts >= 5) {
        swap(it, 'task:agent', 'needs-human');
        record('handoff-exhausted', { task: it.taskId, issue: it.number });
      } else {
        swap(it, 'task:agent', 'task:ready'); // bounded revert; tick cadence is the backoff
      }
      return;
    }
    record('handoff', { task: it.taskId, issue: it.number });
    const spawn = () => {
      const s = { id: `s-${++sessionSeq}`, item: it.number };
      it.sessions.push(s);
      schedule(now + 30_000, () => startAgentSession(s, it, task));
    };
    spawn();
    if (world._apiTimeoutOnce) { // the call timed out client-side but landed
      world._apiTimeoutOnce = false;
      record('invoke-retry-duplicate', { task: it.taskId, issue: it.number });
      spawn(); // the retry creates the second session
    }
  }

  function startAgentSession(s, it, task) {
    if (it.state !== 'open' || !has(it, 'task:agent')) return;
    it.agentClaims.push(s); // the agent-side lease: claim comment, re-read
    if (it.agentClaims[0] !== s) {
      record('agent-lease-lost', { task: it.taskId, issue: it.number, session: s.id });
      return; // the loser stops without touching the item (F5)
    }
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

  function executeClaimed(it, task) {
    if (crashNextOf.delete(it.taskId)) {
      record('executor-crash', { task: it.taskId, issue: it.number });
      return false; // died mid-claim: labels stay, the leash reclaim recovers (S8)
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
      return true;
    }
    // prework → optional hand-off → converge, as timed phases
    schedule(now + (task.preworkMinutes ?? 1) * MIN, () => {
      if (it.state !== 'open' || !has(it, 'task:executing')) return;
      it.lastActivity = now;
      if (task.preworkFails?.(world, now)) {
        swap(it, 'task:executing', 'needs-human');
        record('prework-failed', { task: it.taskId, issue: it.number });
        return;
      }
      const wantsAgent = task.agentMinutes != null &&
        (task.requestsAgent ? task.requestsAgent(world, now) : true);
      if (!wantsAgent) { close(it, task.outcome ?? 'done'); return; }
      handOff(it, task);
    });
    return true;
  }

  function executorRun(execId = 'E1') {
    for (let i = 0; i < 10; i++) {
      const it = pickable()[0];
      if (!it) return;
      if (!claim(it, execId, new Set(it.labels))) continue;
      const task = registry.get(it.taskId);
      if (!task) { close(it, 'obsolete'); continue; } // validate: task gone (S20)
      if (!executeClaimed(it, task)) return;
    }
  }

  // ---- the janitor (DESIGN §11): the judgment-and-long-horizon sweeps -------
  function janitor() {
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
        const dead = it.agentClaims[0]?.id ?? it.sessions.at(-1)?.id ?? 'unknown';
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
      schedule(T(isoTime) + 40_000, executorRun);
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
      if (has(it, 'needs-human')) { it.labels.delete('needs-human'); it.labels.add('task:ready'); it.readySince = now; }
      if (urgent) it.labels.add('task:urgent');
      record('force', { task: taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun()); // the labeled event's latency sugar
      return it;
    },

    // ad-hoc work is creating an item (DESIGN §8) — origin manual.
    // eventLost models a dropped `labeled` webhook (S16): no immediate
    // executor run fires; the next tick's drain is the guarantee.
    createItem(taskId, { urgent = false, notBefore = null, blockedBy = [], qualifier = null, eventLost = false } = {}) {
      const born = notBefore !== null || blockedBy.length ? 'task:blocked' : 'task:ready';
      const it = createIssue({ taskId, origin: 'manual', labels: [born], notBefore, blockedBy, urgent, qualifier });
      if (born === 'task:ready' && !eventLost) schedule(now + 1 * MIN, () => executorRun());
      return it;
    },

    crashNextExecutionOf(taskId) { crashNextOf.add(taskId); return sim; },
    crashNextAgentOf(taskId) { crashAgentOf.add(taskId); return sim; },

    // the task file disappears from HEAD (S20): validate-in-code closes obsolete
    removeTask(taskId) { registry.delete(taskId); return sim; },

    // ---- multi-executor contention (S7) ------------------------------------
    // Two executors read the SAME snapshot of the ready list, so both pick
    // the same first item; both swap and post claim comments; the earliest
    // comment wins and the loser moves on to the next item read from LIVE
    // state — the verified lease, stale-read and all (DESIGN §6.2).
    raceExecutorsAt(isoTime, execIds) {
      schedule(T(isoTime), () => {
        const snapshot = pickable();
        const target = snapshot[0];
        if (!target) return;
        const preRead = new Set(target.labels); // both reads predate both swaps
        for (const execId of execIds) {
          const won = claim(target, execId, preRead);
          if (won) {
            const task = registry.get(target.taskId);
            if (task) executeClaimed(target, task);
          } else {
            executorRun(execId); // the loser picks a different item, from live state
          }
        }
      });
      return sim;
    },

    // ---- platform failure injection (S9/S10) -------------------------------
    apiDownUntil(isoTime) { world._apiDownUntil = T(isoTime); return sim; },
    apiTimeoutOnce() { world._apiTimeoutOnce = true; return sim; },

    // ---- fleet / human levers ----------------------------------------------
    quarantine(number) { issues.find((i) => i.number === number).quarantined = true; return sim; },
    closeByHand(number, outcome = 'obsolete') {
      const it = issues.find((i) => i.number === number);
      it.state = 'closed'; it.closedAt = now; it.outcome = outcome;
      for (const l of [...it.labels]) if (l.startsWith('task:') || l === 'needs-human') it.labels.delete(l);
      record('close', { task: it.taskId, issue: it.number, outcome, by: 'hand' });
      return sim;
    },
    // the sanctioned human re-queue (F7, DESIGN §4): strip needs-human,
    // apply task:ready — the same lever forcing uses
    requeue(number) {
      const it = issues.find((i) => i.number === number);
      it.labels.delete('needs-human');
      it.labels.delete('task:blocked');
      it.notBefore = null;
      it.labels.add('task:ready');
      it.readySince = now;
      it.lastActivity = now;
      record('requeue', { task: it.taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun());
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
        schedule(t + 40_000, executorRun);
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
