import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_TERMS, activityOf, FIGURES } from '../../tasks/usage-review/figures.mjs';

// A window of decoded day rows carrying whichever counters the case is about.
const window = (...days) => ({ days, carriesCheckFindings: true });
const day = (fields) => ({ ...fields });

test('the blend weights every term it names, and the weights are the only bias in it', () => {
  const names = Object.keys(ACTIVITY_TERMS);
  assert.deepEqual(names, ['userMessages', 'tokensOut', 'merges', 'itemsClosed'],
    'the four the owner named: prompts, conversation tokens, pull requests, closed items');
  const total = names.reduce((sum, n) => sum + ACTIVITY_TERMS[n].weight, 0);
  assert.equal(Math.round(total * 1000) / 1000, 1, 'the weights are a distribution');
  for (const n of names) assert.ok(ACTIVITY_TERMS[n].per >= 1, `${n} names the unit it is scaled by`);
});

test('activity is the weighted mean of the terms, each on its own scale', () => {
  // Four terms each standing at 100 of their OWN unit blend to 100, whatever the
  // weights are - which is what makes `per`, not the weights, responsible for
  // putting the terms on one scale.
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
  const atUnits = (n) => (name) => ACTIVITY_TERMS[name].per * n;
  near(activityOf(atUnits(100)), 100);
  near(activityOf(atUnits(7)), 7);
  // …and one term standing twice as tall moves the blend by exactly its weight.
  const doubled = (name) => ACTIVITY_TERMS[name].per * (name === 'userMessages' ? 200 : 100);
  near(activityOf(doubled), 100 + 100 * ACTIVITY_TERMS.userMessages.weight);
});

test('a term the record does not carry is dropped, never counted as zero', () => {
  // The whole point of the blend's unknown handling: a window frozen before a
  // counter existed must not read as a window in which nothing happened.
  const onlyPrompts = (name) => (name === 'userMessages' ? 500 : null);
  assert.equal(activityOf(onlyPrompts), 500,
    'the surviving term answers at full strength, re-normalized over what was recorded');
  const none = () => null;
  assert.equal(activityOf(none), null, 'no term recorded is not an activity of zero');
  // A real zero is a real zero, and is not confused with the absent case.
  const quiet = () => 0;
  assert.equal(activityOf(quiet), 0);
});

test('the activity figure reads the four counters out of the window it is given', () => {
  const read = FIGURES.get('activity');
  assert.ok(read, 'a rule naming activity must find a reader for it');
  const w = window(
    day({ userMessages: 20, tokensOut: 100_000, merges: 5, queue: { 'a/b': { done: 3 } } }),
    day({ userMessages: 20, tokensOut: 100_000, merges: 5, queue: { 'a/b': { done: 3 } } }),
  );
  // 40 prompts, 200k out (= 2 units), 10 merges, 6 closed.
  const expected = 0.4 * 40 + 0.2 * 2 + 0.2 * 10 + 0.2 * 6;
  assert.equal(Math.round(read({}, w) * 1000) / 1000, Math.round(expected * 1000) / 1000);
});

test('activity over a window carrying nothing is not recorded', () => {
  const read = FIGURES.get('activity');
  assert.equal(read({}, window(day({}))), null,
    'an empty window cannot be judged busy, and must not read as quiet');
});

// A check that ran over two thousand files and caught nothing and a check whose
// scan selects no file here carry the same finding volume. `reach` is what tells
// them apart, and `opportunities` is what a volume of zero is judged against.
const ranChecks = (runs) => day({ checks: { world: { runs } } });

test('opportunities is how often THIS check could have fired: its reach times the runs', () => {
  const read = FIGURES.get('opportunities');
  assert.ok(read, 'a rule naming opportunities must find a reader for it');
  assert.equal(read({ id: 'a-check', reach: 5 }, window(ranChecks(10), ranChecks(10))), 100);
  assert.equal(read({ id: 'a-check', reach: 0 }, window(ranChecks(10))), 0,
    'a check with nothing in scope had no opportunity, however often the sweeps ran');
  assert.equal(FIGURES.get('reach')({ id: 'a-check', reach: 0 }), 0);
});

test('a reach nothing could answer is not recorded, and never a zero', () => {
  const read = FIGURES.get('opportunities');
  // A coded rule declares no scan set, and an engine older than the reader
  // answers for none of them. Either way the subject carries no reach, and a
  // rule floored on opportunities must leave it *not evaluated* rather than
  // report an unmeasurable check as one that could never have fired.
  assert.equal(FIGURES.get('reach')({ id: 'a-check' }), null);
  assert.equal(read({ id: 'a-check' }, window(ranChecks(10))), null);
  assert.equal(read({ id: 'a-check', reach: null }, window(ranChecks(10))), null);
  // …and a window that recorded no runs cannot state the product either.
  assert.equal(read({ id: 'a-check', reach: 5 }, window(day({}))), null);
});
