import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePreconditions } from '../precondition-policy.mjs';
import { evaluatePrecondition } from '../queue/executor.mjs';

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
