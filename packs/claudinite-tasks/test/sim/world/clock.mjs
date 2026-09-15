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

const at_ = (when) => (typeof when === 'number' ? when : Date.parse(when));

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function makeClock({ start = '2026-08-12T00:00:00Z' } = {}) {
  let t = at_(start);
  let seq = 0;
  const queue = [];

  const port = {
    now: () => new Date(t),
    nowMs: () => t,
    nowIso: () => new Date(t).toISOString(),
  };

  // Book `fn` at an absolute instant. An instant already past is booked at the
  // current one rather than dropped: a fake that silently "missed" it would be
  // modelling a platform behaviour nobody asked for.
  const at = (when, fn) => { queue.push({ t: Math.max(at_(when), t), seq: seq++, fn }); return harness; };
  const after = (deltaMs, fn) => at(t + deltaMs, fn);

  // Fire every event strictly before `to`, then park the clock AT `to`. Events
  // beyond it SURVIVE for a later segment — a scenario runs in phases to assert
  // a mid-state, and a queue emptied at each boundary would lose them.
  //
  // Each event is AWAITED. The code the harness drives is async throughout, and
  // a synchronous drain would let the next instant's event run while the last
  // one's promise was still settling — virtual time going backwards, silently,
  // exactly where a scenario is asserting an ordering.
  const runUntil = async (to) => {
    const end = at_(to);
    for (;;) {
      queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
      if (!queue.length || queue[0].t >= end) break;
      const ev = queue.shift();
      t = ev.t;
      await ev.fn();
    }
    t = end;
    return harness;
  };

  const harness = {
    port,
    at,
    after,
    runUntil,
    // The instant, for a scenario computing one rather than reading it back off
    // an artifact.
    ms: () => t,
    iso: () => port.nowIso(),
    // How much has not fired yet: what a scenario asserting "nothing is left"
    // reads, instead of reaching into the array.
    pending: () => queue.length,
  };
  return harness;
}
