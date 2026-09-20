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

// THE EXACT PERIOD BOUNDARY. A period opening is the common case, not the exotic
// one: `<=` and `<` differ on exactly one input, so each cadence is pinned at the
// instant its period opens and at the millisecond before it.
const anchorAt = (freq, iso) => anchorInstant(freq, new Date(iso)).toISOString();

test('a period that opens exactly now is this period\'s, not the previous one', () => {
  assert.equal(anchorAt('daily', '2026-09-15T00:00:00.000Z'), '2026-09-15T00:00:00.000Z');
  assert.equal(anchorAt('weekly', '2026-09-13T00:00:00.000Z'), '2026-09-13T00:00:00.000Z');
  assert.equal(anchorAt('monthly', '2026-09-01T00:00:00.000Z'), '2026-09-01T00:00:00.000Z');
});

test('one millisecond earlier, the current period is still the previous one', () => {
  assert.equal(anchorAt('daily', '2026-09-14T23:59:59.999Z'), '2026-09-14T00:00:00.000Z');
  assert.equal(anchorAt('weekly', '2026-09-12T23:59:59.999Z'), '2026-09-06T00:00:00.000Z');
  assert.equal(anchorAt('monthly', '2026-08-31T23:59:59.999Z'), '2026-08-01T00:00:00.000Z');
});
