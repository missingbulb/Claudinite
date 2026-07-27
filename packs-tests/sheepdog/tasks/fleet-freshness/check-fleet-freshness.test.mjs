import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFreshness, convergeDrift, FRESH } from '../../../../packs/sheepdog/tasks/fleet-freshness/check-fleet-freshness.mjs';

// The freshness sweep's whole judgement is `classifyFreshness` — pure, so every
// branch is exercised here without a network. The precedence between states is the
// point of the function, not an accident of the if-chain: a member with no scheduler
// is ALSO behind, and reporting "behind" would send the reader chasing a symptom.

const DAY = 86_400_000;
const NOW = Date.parse('2026-07-27T12:00:00Z');
const ancestor = (aheadBy, ageDays) => ({ status: aheadBy ? 'ahead' : 'identical', aheadBy, baseDateMs: NOW - ageDays * DAY });
const classify = (over) => classifyFreshness({
  stampedRef: 'abc123', hasScheduler: true, compare: ancestor(0, 0), nowMs: NOW, staleDays: 14, ...over,
});

test('classifyFreshness: at canon head, or behind within the window, is fresh', () => {
  assert.equal(classify({}).state, FRESH);
  assert.equal(classify({ compare: ancestor(40, 13.9) }).state, FRESH);
  // a very old stamp is fine when canon has not moved past it
  assert.equal(classify({ compare: ancestor(0, 400) }).state, FRESH);
});

test('classifyFreshness: past the window with canon ahead is behind, and says how far', () => {
  const v = classify({ compare: ancestor(37, 20) });
  assert.equal(v.state, 'behind');
  assert.match(v.detail, /20 days old/);
  assert.match(v.detail, /37 canon commit/);
  assert.match(v.detail, /14-day window/);
  // the window is a knob, not a constant: the same repo is fresh under a wider one
  assert.equal(classifyFreshness({
    stampedRef: 'abc123', hasScheduler: true, compare: ancestor(37, 20), nowMs: NOW, staleDays: 30,
  }).state, FRESH);
});

test('classifyFreshness: an off-trunk stamp is a wedge, not a delay', () => {
  // not a canon commit at all (canon's compare 404s)
  assert.equal(classify({ compare: null }).state, 'ref-not-on-trunk');
  // a canon commit, but not an ancestor of the default branch — what #328 refuses
  for (const status of ['diverged', 'behind']) {
    const v = classify({ compare: { status, aheadBy: 0, baseDateMs: NOW } });
    assert.equal(v.state, 'ref-not-on-trunk', status);
    assert.match(v.detail, new RegExp(status));
  }
});

test('classifyFreshness: root cause wins over symptom', () => {
  // no scheduler AND far behind → no-scheduler, because the missing cron is WHY
  assert.equal(classify({ hasScheduler: false, compare: ancestor(90, 60) }).state, 'no-scheduler');
  // no stamp outranks even that: nothing was ever vendored
  assert.equal(classify({ stampedRef: null, hasScheduler: false }).state, 'no-stamp');
  // and an unvendored repo is never asked about trunk
  assert.equal(classify({ stampedRef: null, compare: null }).state, 'no-stamp');
});

// --- convergence --------------------------------------------------------------

// A fake gh that records writes. Only the calls convergeDrift makes are modelled.
function fakeGh(issues) {
  const calls = [];
  return {
    calls,
    gh: async (path, { method = 'GET', body } = {}) => {
      if (method === 'GET') return { status: 200, json: issues };
      calls.push({ path, method, body });
      if (path.endsWith('/issues')) return { status: 201, json: { number: 99 } };
      return { status: 200, json: {} };
    },
  };
}
const issue = (n, fullName, state, bodyState) => ({
  number: n, state, title: `Claudinite mount has fallen behind on ${fullName}`,
  body: bodyState ? `<!-- fleet-freshness: ${bodyState} -->\nbody` : 'body',
  closed_at: '2026-07-01T00:00:00Z',
});
const verdict = (fullName, state) => ({ fullName, state, detail: 'because' });
const empty = { unhealthy: [], healthySet: new Set(), goneSet: new Set(), staleDays: 14 };

test('convergeDrift: opens one issue per newly-unhealthy member', async () => {
  const { gh, calls } = fakeGh([]);
  const actions = await convergeDrift(gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] });
  assert.deepEqual(actions, ['opened #99 (o/a: behind)']);
  assert.equal(calls[0].body.labels[0], 'fleet-drift');
  assert.match(calls[0].body.body, /<!-- fleet-freshness: behind -->/);
});

test('convergeDrift: an unchanged verdict is silent; a changed one updates and comments once', async () => {
  const same = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  assert.deepEqual(await convergeDrift(same.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] }), []);
  assert.deepEqual(same.calls, [], 'a weekly sweep must not re-comment the same story');

  const moved = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  const actions = await convergeDrift(moved.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'no-scheduler')] });
  assert.deepEqual(actions, ['updated #7 (o/a: behind → no-scheduler)']);
  assert.equal(moved.calls.filter((c) => c.path.endsWith('/comments')).length, 1);
  assert.match(moved.calls.find((c) => !c.path.endsWith('/comments')).body.body, /no-scheduler/);
});

test('convergeDrift: closes on recovery and on leaving the fleet, with distinct reasons', async () => {
  const well = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  assert.deepEqual(await convergeDrift(well.gh, 'o/home', { ...empty, healthySet: new Set(['o/a']) }),
    ['closed #7 (o/a: is up to date with canon again)']);
  assert.equal(well.calls.at(-1).body.state_reason, 'completed');

  const left = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  await convergeDrift(left.gh, 'o/home', { ...empty, goneSet: new Set(['o/a']) });
  assert.equal(left.calls.at(-1).body.state_reason, 'not_planned');
});

test('convergeDrift: an UNKNOWN member holds its issue open — absence of a verdict is not recovery', async () => {
  // o/a is in neither unhealthy, healthySet nor goneSet: its probe errored this run.
  const { gh, calls } = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  assert.deepEqual(await convergeDrift(gh, 'o/home', empty), []);
  assert.deepEqual(calls, []);
});

test('convergeDrift: reopens a regression, but honours a deliberate not-planned close', async () => {
  const back = fakeGh([{ ...issue(7, 'o/a', 'closed', 'behind'), state_reason: 'completed' }]);
  assert.deepEqual(await convergeDrift(back.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] }),
    ['reopened #7 (o/a: behind)']);

  const declined = fakeGh([{ ...issue(7, 'o/a', 'closed', 'behind'), state_reason: 'not_planned' }]);
  assert.deepEqual(await convergeDrift(declined.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] }), []);
  assert.deepEqual(declined.calls, []);
});
