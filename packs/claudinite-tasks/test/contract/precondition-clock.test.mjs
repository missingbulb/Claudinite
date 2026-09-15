import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePreconditions } from '../../src/contract/precondition-policy.mjs';
import { evaluatePrecondition } from '../../src/contract/precondition.mjs';
import { anchorInstant } from '../../src/contract/calendar.mjs';

// A term whose subject is the INSTANT, not the window: "are we inside the
// festival month". Nothing in the signal bundle carries a clock, so without one
// passed in, such a term can only read the process clock — which makes it
// untestable at a chosen moment and impure in a policy module that promises to be
// neither.
const clockTerms = new Map([['in-august', {
  signals: [],
  holds(_s, { now }) {
    if (!(now instanceof Date)) return { error: 'no clock was passed to the term' };
    return now.getUTCMonth() === 7
      ? { holds: true, reason: `in August (${now.toISOString()})` }
      : { holds: false, reason: `outside August (${now.toISOString()})` };
  },
}]]);

const at = (iso) => evaluatePreconditions({
  preconditions: ['in-august'], terms: clockTerms, now: new Date(iso), windowDays: 8,
});

test('a term is handed the instant the verdict is being taken at', () => {
  assert.equal(at('2026-08-14T09:00:00Z').run, true);
  assert.equal(at('2026-09-02T09:00:00Z').run, false);
});

// The seam production goes through — a term that reads the clock must work there
// too, or the capability exists only in a direct call.
test('the executor seam passes its own evaluation instant through', () => {
  const task = { decl: { preconditions: ['in-august'], frequency: 'weekly' }, terms: clockTerms };
  assert.equal(evaluatePrecondition(task, {}, {}, null, new Date('2026-08-14T09:00:00Z')).run, true);
  assert.equal(evaluatePrecondition(task, {}, {}, null, new Date('2026-09-02T09:00:00Z')).run, false);
});

// THE EXACT ANCHOR INSTANT. The scheduler fires on an hourly cron, so a daily task
// anchored at 04:00 is evaluated AT 04:00:00.000 on the ordinary path — the boundary
// is the common case here, not the exotic one. Each cadence is pinned at the instant
// and at the millisecond before it, because `<=` and `<` differ on exactly one input
// and every test that stood here sat far enough from the anchor to agree either way.
const anchorAt = (freq, schedule, iso) => anchorInstant(freq, schedule, new Date(iso)).toISOString();

test('an anchor that falls exactly now is this period\'s, not the previous one', () => {
  assert.equal(anchorAt('daily', { dailyHour: 4 }, '2026-09-15T04:00:00.000Z'), '2026-09-15T04:00:00.000Z');
  assert.equal(anchorAt('weekly', { weeklyDay: 'Sun', dailyHour: 4 }, '2026-09-13T04:00:00.000Z'), '2026-09-13T04:00:00.000Z');
  assert.equal(anchorAt('monthly', { monthlyDay: 1, dailyHour: 4 }, '2026-09-01T04:00:00.000Z'), '2026-09-01T04:00:00.000Z');
});

test('one millisecond before the anchor, the most recent one is still the previous period\'s', () => {
  assert.equal(anchorAt('daily', { dailyHour: 4 }, '2026-09-15T03:59:59.999Z'), '2026-09-14T04:00:00.000Z');
  assert.equal(anchorAt('weekly', { weeklyDay: 'Sun', dailyHour: 4 }, '2026-09-13T03:59:59.999Z'), '2026-09-06T04:00:00.000Z');
  assert.equal(anchorAt('monthly', { monthlyDay: 1, dailyHour: 4 }, '2026-09-01T03:59:59.999Z'), '2026-08-01T04:00:00.000Z');
});
