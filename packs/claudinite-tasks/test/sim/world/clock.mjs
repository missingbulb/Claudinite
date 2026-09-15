// THE FAKE CLOCK — virtual time and the ordered event queue every other fake
// module schedules on.
//
// It stands in for `src/world/clock.mjs`, so `port` carries exactly that
// module's names and nothing else; everything a scenario drives the clock WITH
// hangs off the harness object beside it. That split is what lets the parity
// guard compare key sets — a port that also carried `runUntil` could never be
// compared against the real one — and it is the shape every module in this
// folder takes.
//
// Time moves only when an event fires or a scenario advances it. There is no
// wall clock here at all — no `setTimeout`, no `Date.now()` — so a run is
// deterministic and a scenario spanning a fortnight costs microseconds.
//
// ORDERING IS TOTAL: strictly by instant, FIFO within a tie. Two events booked
// for the same instant fire in the order they were booked, which is what lets a
// scenario WRITE a race rather than hope for one.
//
// AN EVENT MAY WAIT FOR A LATER ONE, which is why the loop below is a pump rather
// than `await ev.fn()` per event. The code this harness drives is straight-line
// async — an executor run awaits its work step, and that step takes virtual
// minutes — so an event awaited to completion would be waiting on an event the
// queue can no longer reach. Instead an event is STARTED, and the clock advances
// only once every started event has either finished or parked on `sleep`.
// `running` counts the started, `waiting` the parked, and equality is quiescence:
// nothing is mid-step, so the next instant is safe to fire.
//
// `sleep` is therefore the only legal way to wait for virtual time from inside an
// event. A real timer would never fire at all here, and a promise resolved from
// outside the accounting is invisible to the pump — which would call the world
// quiet while a run was still mid-step.

const at_ = (when) => (typeof when === 'number' ? when : Date.parse(when));

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// How many macrotask turns the pump spends waiting for quiescence before it calls
// the world wedged. Generous — a cold dynamic import takes a few — and finite,
// because the alternative to this error is a test that hangs with no output.
const SETTLE_TURNS = 5000;

export function makeClock({ start = '2026-08-12T00:00:00Z' } = {}) {
  let t = at_(start);
  let seq = 0;
  const queue = [];
  let running = 0;
  let waiting = 0;
  const failures = [];

  const port = {
    now: () => new Date(t),
    nowMs: () => t,
    nowIso: () => new Date(t).toISOString(),
    // The real port's escape hatch, which this one has no use for: installing a
    // reading of "now" into the clock that IS the reading changes nothing. It is
    // here so the two ports stay comparable, and so a caller holding either can
    // call it without asking which it holds.
    installClock: () => () => {},
  };

  // Book `fn` at an absolute instant. An instant already past is booked at the
  // current one rather than dropped: a fake that silently "missed" it would be
  // modelling a platform behaviour nobody asked for.
  const at = (when, fn) => { queue.push({ t: Math.max(at_(when), t), seq: seq++, fn }); return harness; };
  const after = (deltaMs, fn) => at(t + deltaMs, fn);

  // Wait `ms` of VIRTUAL time from inside a running event. The wait is declared to
  // the pump, so the clock knows this event is parked rather than mid-step, and it
  // resumes as an ordinary booked event — a sleeper takes its turn in the same
  // total order as everything else.
  const sleep = (ms) => new Promise((resolve) => {
    waiting += 1;
    at(t + Math.max(0, ms), () => { waiting -= 1; resolve(); });
  });

  // Wait for something that is not virtual time but cannot settle until it
  // advances — a queued workflow run waiting for the one holding its concurrency
  // group. Declared to the pump the same way `sleep` is, because the alternative
  // is a world that never reaches quiescence and so never advances the clock the
  // waiter is waiting for.
  const park = (promise) => {
    waiting += 1;
    return Promise.resolve(promise).then(
      (v) => { waiting -= 1; return v; },
      (e) => { waiting -= 1; throw e; },
    );
  };

  // Start an event without waiting for it. A rejection is collected rather than
  // thrown here: it belongs to the scenario that ran the segment, not to whichever
  // instant happened to be current when it surfaced.
  const fire = (fn) => {
    running += 1;
    Promise.resolve().then(fn).then(
      () => { running -= 1; },
      (e) => { running -= 1; failures.push(e); },
    );
  };

  // Let every started event run until it finishes or parks. One macrotask turn
  // drains the whole microtask chain behind it, so ordinary async code — a promise
  // chain, an awaited fake API call, a cached dynamic import — settles in a turn or
  // two; only virtual time takes more.
  // Quiescence is "no started event is mid-step", which is `running <= waiting`
  // rather than equality: a scenario may sleep or park from OUTSIDE any event —
  // starting a run by hand and letting its body take virtual minutes — and such a
  // waiter is parked without ever having been counted as running.
  const settle = async () => {
    for (let i = 0; i < SETTLE_TURNS; i += 1) {
      await new Promise((r) => setImmediate(r));
      if (running <= waiting) return;
    }
    throw new Error(`the fake world did not settle: ${running - waiting} event(s) are still mid-step`
      + ' — something is waiting on a promise that virtual time can never resolve');
  };

  // Fire every event strictly before `to`, then park the clock AT `to`. Events
  // beyond it SURVIVE for a later segment — a scenario runs in phases to assert
  // a mid-state, and a queue emptied at each boundary would lose them.
  const runUntil = async (to) => {
    const end = at_(to);
    for (;;) {
      await settle();
      queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
      if (!queue.length || queue[0].t >= end) break;
      const ev = queue.shift();
      t = ev.t;
      fire(ev.fn);
    }
    await settle();
    t = end;
    if (failures.length) throw failures[0];
    return harness;
  };

  const harness = {
    port,
    at,
    after,
    sleep,
    park,
    runUntil,
    // The instant, for a scenario computing one rather than reading it back off
    // an artifact.
    ms: () => t,
    iso: () => port.nowIso(),
    // How much has not fired yet: what a scenario asserting "nothing is left"
    // reads, instead of reaching into the array.
    pending: () => queue.length,
    // Anything a started event threw. `runUntil` rethrows the first, so this is
    // for a scenario that wants to look without ending its segment.
    failures: () => failures,

    // VIRTUAL TIMERS, in the `setInterval`/`clearInterval` shape the engine's
    // heartbeat hangs its beat on. A real timer inside a work step of virtual
    // minutes never fires at all, so the beats would be missing from exactly the
    // timeline the executing leash reads.
    timers: () => {
      let nextId = 0;
      const live = new Set();
      const setIntervalV = (fn, ms) => {
        const id = (nextId += 1);
        live.add(id);
        const tick = () => {
          if (!live.has(id)) return;
          fn();
          at(t + ms, tick);
        };
        at(t + ms, tick);
        return id;
      };
      return { setInterval: setIntervalV, clearInterval: (id) => live.delete(id) };
    },
  };
  return harness;
}
