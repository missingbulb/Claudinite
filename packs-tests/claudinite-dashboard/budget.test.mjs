import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planPolicy, classify, estimateCost, reserveFor, credentialAdvice, MINUTE_MS, HOUR_MS,
} from '../../packs/claudinite-dashboard/budget.mjs';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const resetIn = (ms) => (NOW + ms) / 1000;

test('the tier is read off the limit, not off whether a token was supplied', () => {
  // The case that matters: a token the server REJECTED reports the anonymous limit
  // while the page still believes it is signed in.
  assert.equal(classify(60), 'anonymous');
  assert.equal(classify(5000), 'user');
  assert.equal(classify(1000), 'workflow');
  assert.equal(classify(null), 'unknown');
});

test('an unknown budget reads live — the first response is what teaches it', () => {
  const p = planPolicy({ memberCount: 12, now: NOW });
  assert.equal(p.mode, 'live');
  assert.equal(p.minAge, 0);
  assert.equal(p.spendCeiling, Infinity);
});

test('a signed-in viewer with a full budget revalidates everything', () => {
  const p = planPolicy({ remaining: 4900, limit: 5000, reset: resetIn(HOUR_MS), memberCount: 12, now: NOW });
  assert.equal(p.mode, 'live');
  assert.equal(p.minAge, 0, 'nothing is held back when there is budget to spare');
});

// The owner's case, and the whole reason this module exists: a twelve-member fleet
// costs ~75 requests and the anonymous budget is 60 an hour, so the FIRST sweep
// exceeds it. The page must not plan that sweep as though it were affordable.
test('an anonymous viewer on a fleet is planned as scarce, not live', () => {
  const p = planPolicy({ remaining: 58, limit: 60, reset: resetIn(40 * MINUTE_MS), memberCount: 12, now: NOW });
  assert.equal(p.mode, 'scarce');
  assert.ok(p.minAge > 0, 'cached data must be served without a request');
  assert.ok(p.spendCeiling < 58, 'the last requests are never the page\'s to spend');
});

// This is the requirement stated as a test: when the budget is low, reloading the
// page costs NOTHING until the limit resets. `minAge` is what makes that true, so it
// has to cover the window, not a fixed few minutes.
test('under pressure the staleness floor reaches the reset', () => {
  const p = planPolicy({ remaining: 20, limit: 60, reset: resetIn(25 * MINUTE_MS), memberCount: 12, now: NOW });
  assert.equal(p.minAge, 25 * MINUTE_MS);
});

test('the floor is capped at an hour — no reset is further out than that', () => {
  const p = planPolicy({ remaining: 1, limit: 60, reset: resetIn(9 * HOUR_MS), memberCount: 12, now: NOW });
  assert.equal(p.minAge, HOUR_MS);
});

test('a spent budget makes no requests at all', () => {
  const p = planPolicy({ remaining: 2, limit: 60, reset: resetIn(10 * MINUTE_MS), memberCount: 12, now: NOW });
  assert.equal(p.mode, 'frozen');
  assert.equal(p.spendCeiling, 0);
  assert.match(p.reason, /cached/);
});

test('the same budget is generous for one repo and scarce for a fleet', () => {
  const one = planPolicy({ remaining: 300, limit: 5000, reset: resetIn(HOUR_MS), memberCount: 1, now: NOW });
  const many = planPolicy({ remaining: 300, limit: 5000, reset: resetIn(HOUR_MS), memberCount: 60, now: NOW });
  assert.equal(one.mode, 'live');
  assert.equal(many.mode, 'scarce', 'one sweep costs more than the whole remaining budget');
});

test('the reserve is a share of the limit, floored and capped', () => {
  assert.equal(reserveFor(60), 6);
  assert.equal(reserveFor(5000), 50);
  assert.equal(reserveFor(20), 5);
  assert.equal(reserveFor(null), 5);
});

test('cost scales with the roster and never reads as zero', () => {
  assert.ok(estimateCost(12) > estimateCost(1));
  assert.ok(estimateCost(0) > 0);
});

test('the anonymous viewer is told what being logged in to github.com does not buy', () => {
  const a = credentialAdvice('anonymous', { oauth: true });
  assert.match(a.text, /60 requests per hour/);
  assert.match(a.text, /github\.com/);
  assert.equal(credentialAdvice('user'), null);
});

// The first load of a fresh tab has not spoken to GitHub yet, so no header has said
// what the limit is — and that is precisely the load where "you are anonymous, and
// your github.com session is not a credential" needs saying.
test('no credential at all reads as anonymous before any header has said so', () => {
  assert.ok(credentialAdvice('unknown', { hasToken: false }));
  assert.equal(credentialAdvice('unknown', { hasToken: true }), null);
});
