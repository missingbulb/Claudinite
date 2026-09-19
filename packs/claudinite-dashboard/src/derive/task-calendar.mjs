// The scheduling calendar as the dashboard reads it: which instant a task's window
// last opened at or opens next, how long a cadence's period is, and which cadence
// term a declaration states. THE DASHBOARD'S OWN COPY of the queue's arithmetic
// (`packs/claudinite-tasks/src/contract/calendar.mjs` and `src/items/anchors.mjs`):
// packs share no code, so the page talks to the queue only through its vocabulary and
// carries the arithmetic it renders with. `test/task-calendar-drift.test.mjs` runs both
// sides over the same instants and declarations and fails the moment they disagree.
//
// All times are UTC. `now` is always injected, so every answer is deterministic.

const HOUR_MS = 3600e3;
const DAY_MS = 24 * HOUR_MS;

// The documented anchor defaults — applied when a repo omits `schedule` or any of its keys.
export const DEFAULT_SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };

// Sun-indexed to match Date#getUTCDay (0 = Sunday). Also the canonical weekday
// vocabulary the config validator mirrors.
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Last calendar day of a UTC month (day 0 of the next month rolls back).
const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

// Fill any absent key with its documented default; leave present values untouched.
export function normalizeSchedule(schedule = {}) {
  const s = schedule || {};
  return {
    dailyHour: Number.isInteger(s.dailyHour) ? s.dailyHour : DEFAULT_SCHEDULE.dailyHour,
    weeklyDay: WEEKDAYS.includes(s.weeklyDay) ? s.weeklyDay : DEFAULT_SCHEDULE.weeklyDay,
    monthlyDay: Number.isInteger(s.monthlyDay) ? s.monthlyDay : DEFAULT_SCHEDULE.monthlyDay,
  };
}

// The most recent occurrence of `frequency` at or before `now`, as a Date —
// `null` for `manual`, which has none. `now` may be a Date or anything the Date
// constructor accepts; `schedule` is normalized here, so callers need not.
export function mostRecentAnchor(frequency, schedule, now) {
  const s = normalizeSchedule(schedule);
  const at = new Date(now);
  const nowMs = at.getTime();
  const freq = frequency;

  if (freq === 'manual') return null;

  if (freq === 'daily') {
    // Walk anchor DATES back from today until the instant is ≤ now: today's anchor hour may not
    // have come yet, in which case the most recent occurrence is yesterday's.
    let anchor = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    for (;;) {
      const time = new Date(anchor.getTime() + s.dailyHour * HOUR_MS);
      if (time.getTime() <= nowMs) return time;
      anchor = new Date(anchor.getTime() - DAY_MS);
    }
  }

  if (freq === 'weekly') {
    const targetDow = WEEKDAYS.indexOf(s.weeklyDay);
    let date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    // Up to 8 steps guarantees the previous week's occurrence even when today is
    // the weekly day but earlier than dailyHour.
    for (let i = 0; i < 8; i += 1) {
      if (date.getUTCDay() === targetDow) {
        const time = new Date(date.getTime() + s.dailyHour * HOUR_MS);
        if (time.getTime() <= nowMs) return time;
      }
      date = new Date(date.getTime() - DAY_MS);
    }
    // Unreachable in practice (a matching weekday always exists within 7 days).
    throw new Error(`no weekly occurrence resolved for ${s.weeklyDay}`);
  }

  if (freq === 'monthly') {
    let year = at.getUTCFullYear();
    let month = at.getUTCMonth();
    for (;;) {
      const day = Math.min(s.monthlyDay, daysInMonth(year, month)); // clamp to month length
      const time = new Date(Date.UTC(year, month, day) + s.dailyHour * HOUR_MS);
      if (time.getTime() <= nowMs) return time;
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
    }
  }

  throw new Error(`unknown frequency "${frequency}"`);
}

// --- the cadence terms ----------------------------------------------------------
// How a task states WHEN it runs, inside its own `preconditions`: the queue keeps no
// calendar of its own, so the cadence is one of the task's conditions.
//
//   due:<daily|weekly|monthly>   no run since that cadence's most recent anchor on
//                                this repo's schedule — fixed hours, no drift
//   last-run-over:<12h|1d|7d>    the newest run started more than that long ago
//
// Whether a task is asked at all is its `trigger`, not the shape of this list: a
// task nothing asks may still state conditions, which are judged when somebody
// creates an item for it (the retired `frequency: manual` is `trigger: 'request'`).
//
export const CADENCES = ['daily', 'weekly', 'monthly'];
export const DUE_TERM = 'due';
export const ELAPSED_TERM = 'last-run-over';
export const NOT_FAILED_TERM = 'last-run-not-failed';
export const NOT_PARKED_TERM = 'last-run-not-parked';

// `12h`, `1d`, `7d` — a whole number of hours or days, nothing else.
const DURATION_RE = /^(\d+)(h|d)$/;
export function parseDuration(text) {
  const m = DURATION_RE.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n * (m[2] === 'h' ? HOUR_MS : DAY_MS) : null;
}

// The term references an expression carries: each entry split on `||`, each
// reference `{ name, arg }` with the argument after the first colon.
const alternativesOf = (entry) => String(entry ?? '').split('||').map((t) => t.trim()).filter(Boolean)
  .map((t) => { const c = t.indexOf(':'); return c === -1 ? { name: t, arg: null } : { name: t.slice(0, c).trim(), arg: t.slice(c + 1).trim() }; });
const entriesOf = (preconditions) => (Array.isArray(preconditions) ? preconditions : []).map(alternativesOf);

// The cadence a declaration states — `{ kind: 'due', cadence }`, `{ kind:
// 'elapsed', ms, text }`, or null for a task with no cadence term (asked at every
// tick while it states any condition, it runs whenever those hold). The first
// cadence term wins.
export function cadenceOf(preconditions) {
  for (const ref of entriesOf(preconditions).flat()) {
    if (ref.name === DUE_TERM && CADENCES.includes(ref.arg)) return { kind: 'due', cadence: ref.arg };
    if (ref.name === ELAPSED_TERM) {
      const ms = parseDuration(ref.arg);
      if (ms) return { kind: 'elapsed', ms, text: ref.arg };
    }
  }
  return null;
}

// Whether the declaration states any condition at all. Not a scheduling answer on
// its own — `trigger` is that. An entry carrying only separators states nothing,
// which is why this is not a length test.
export const statesConditions = (preconditions) => entriesOf(preconditions).some((alts) => alts.length > 0);

// A term gates when it is a whole conjunct of the expression — `['x', …]` gates,
// `['due:daily || x']` merely widens.
const gatesOn = (preconditions, term) =>
  entriesOf(preconditions).some((alts) => alts.length === 1 && alts[0].name === term && alts[0].arg === null);

// A task stops past its own failure park only when it says so: nothing holds a
// task's lane but its own word — `last-run-not-failed` for that park alone, or
// `last-run-not-parked`, which holds behind all four and so answers this too.
export const holdsOnFailure = (preconditions) =>
  gatesOn(preconditions, NOT_FAILED_TERM) || gatesOn(preconditions, NOT_PARKED_TERM);

// Whether the declaration holds its lane behind EVERY park, the three a person's
// inbox owns included. A reader showing what happens next needs the wider answer
// as well: a task held behind an approval park is not being asked on schedule,
// and an anchor shown there promises a run the task declines.
export const holdsOnAnyPark = (preconditions) => gatesOn(preconditions, NOT_PARKED_TERM);

// What the retired `frequency` field always meant, as the term that now says it —
// or null for `manual`, which meant no schedule at all and so adds no term.
export const cadenceTermFor = (frequency) =>
  (frequency === 'manual' ? null : `${DUE_TERM}:${frequency}`);

// --- the anchors ---------------------------------------------------------------

// One period of a cadence word (`daily`, `weekly`, `monthly`; `manual` has none), in
// ms — the coarse step `nextAnchor` walks.
export function periodMs(frequency) {
  const freq = frequency;
  if (freq === 'weekly') return 7 * DAY_MS;
  if (freq === 'monthly') return 31 * DAY_MS;
  if (freq === 'manual') return null;
  return DAY_MS;
}

// The period a TASK keeps, read off the cadence term its declaration states: a
// `due:` cadence's period, a `last-run-over:` duration, and null for a task with
// no cadence term (asked at every tick, it runs on movement or when woken).
export function taskPeriodMs(decl) {
  const cadence = cadenceOf(decl?.preconditions);
  if (cadence?.kind === 'due') return periodMs(cadence.cadence);
  if (cadence?.kind === 'elapsed') return cadence.ms;
  return null;
}

// The earliest occurrence strictly after `now` — what a rolled item is stamped
// with. Derived by walking `mostRecentAnchor` forward rather than by adding a
// period: monthly anchors are not a fixed distance apart, and a `daily-2h` whose
// instant wraps to the previous calendar day is exactly the case a fixed add gets
// wrong. The coarse step is under one period, so the loop advances by at most two
// steps and never overshoots an occurrence.
export function nextAnchor(frequency, schedule, now) {
  if (frequency === 'manual') return null;
  const from = mostRecentAnchor(frequency, schedule, now).getTime();
  const step = frequency === 'monthly' ? 28 * DAY_MS : periodMs(frequency);
  for (let t = from + step; ; t += step) {
    const candidate = mostRecentAnchor(frequency, schedule, new Date(t));
    if (candidate.getTime() > from) return candidate;
  }
}
