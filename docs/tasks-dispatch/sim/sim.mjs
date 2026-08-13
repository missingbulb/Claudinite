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
  staleReadyPeriods = 2,
} = {}) {
  const registry = new Map(tasks.map((t) => [t.id, t]));
  const titleOf = (id) => `[claudinite-work] ${id}`;

  const issues = []; // {number,title,taskId,origin,labels:Set,state,createdAt,closedAt,readySince,lastActivity,notBefore,blockedBy:[],outcome,rolls:[],comments:[],escalated}
  const log = []; // {t,kind,task,issue,...}
  const world = {}; // scenario-owned signal state, read by precondition fns
  const queue = []; // {t,seq,fn}
  let seq = 0;
  let now = 0;
  const crashNextOf = new Set(); // taskIds whose next execution dies mid-claim

  const schedule = (t, fn) => queue.push({ t, seq: seq++, fn });
  const record = (kind, extra) => log.push({ t: now, at: iso(now), kind, ...extra });

  const open = () => issues.filter((i) => i.state === 'open');
  const has = (i, l) => i.labels.has(l);
  const family = (taskId) =>
    issues.filter((i) => i.title === titleOf(taskId) && i.origin === 'schedule');
  const standingItem = (taskId) => family(taskId).find((i) => i.state === 'open');

  function createIssue({ taskId, origin, labels, notBefore = null, blockedBy = [], urgent = false }) {
    const it = {
      number: issues.length + 900,
      title: titleOf(taskId),
      taskId, origin,
      labels: new Set(labels.concat(urgent ? ['task:urgent'] : [])),
      state: 'open',
      createdAt: now, closedAt: null,
      readySince: labels.includes('task:ready') ? now : null,
      lastActivity: now,
      notBefore, blockedBy,
      outcome: null, rolls: [], comments: [], escalated: false,
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

  function executorRun() {
    for (let i = 0; i < 10; i++) {
      const it = pickable()[0];
      if (!it) return;
      swap(it, 'task:ready', 'task:executing'); // the lease, deterministic here
      const task = registry.get(it.taskId);
      if (!task) { close(it, 'obsolete'); continue; } // validate: task gone (S20)
      if (crashNextOf.delete(it.taskId)) {
        record('executor-crash', { task: it.taskId, issue: it.number });
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
        continue;
      }
      // prework → optional hand-off → converge, as timed phases
      const preworkMs = (task.preworkMinutes ?? 1) * MIN;
      schedule(now + preworkMs, () => {
        if (it.state !== 'open') return;
        it.lastActivity = now;
        if (task.preworkFails?.(world, now)) {
          swap(it, 'task:executing', 'needs-human');
          record('prework-failed', { task: it.taskId, issue: it.number });
          return;
        }
        const wantsAgent = task.agentMinutes != null &&
          (task.requestsAgent ? task.requestsAgent(world, now) : true);
        if (!wantsAgent) { close(it, task.outcome ?? 'done'); return; }
        swap(it, 'task:executing', 'task:agent');
        record('handoff', { task: it.taskId, issue: it.number });
        schedule(now + task.agentMinutes * MIN, () => {
          if (it.state !== 'open') return;
          if (task.agentFails?.(world, now)) {
            swap(it, 'task:agent', 'needs-human');
            record('agent-failed', { task: it.taskId, issue: it.number });
            return;
          }
          close(it, task.outcome ?? 'done');
        });
      });
    }
  }

  // ---- the janitor (DESIGN §11): stale-ready escalation ---------------------
  function janitor() {
    for (const it of open().filter((i) => has(i, 'task:ready') && !i.escalated)) {
      const per = registry.has(it.taskId) ? periodMs(registry.get(it.taskId).frequency) : DAY;
      if (it.readySince !== null && now - it.readySince >= staleReadyPeriods * per) {
        it.escalated = true;
        record('escalate', { task: it.taskId, issue: it.number });
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
      if (urgent) it.labels.add('task:urgent');
      record('force', { task: taskId, issue: it.number });
      schedule(now + 1 * MIN, executorRun); // the labeled event's latency sugar
      return it;
    },

    // ad-hoc work is creating an item (DESIGN §8) — origin manual
    createItem(taskId, { urgent = false, notBefore = null, blockedBy = [] } = {}) {
      const born = notBefore !== null || blockedBy.length ? 'task:blocked' : 'task:ready';
      const it = createIssue({ taskId, origin: 'manual', labels: [born], notBefore, blockedBy, urgent });
      if (born === 'task:ready') schedule(now + 1 * MIN, executorRun);
      return it;
    },

    crashNextExecutionOf(taskId) { crashNextOf.add(taskId); return sim; },

    // the task file disappears from HEAD (S20): validate-in-code closes obsolete
    removeTask(taskId) { registry.delete(taskId); return sim; },

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
