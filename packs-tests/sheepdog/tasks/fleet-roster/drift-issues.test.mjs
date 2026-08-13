import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFreshness, convergeDrift, probeMount, renderFreshnessSummary, FRESH,
} from '../../../../packs/sheepdog/tasks/fleet-roster/drift-issues.mjs';

// The freshness question's whole judgement is `classifyFreshness` — pure, so every
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

// --- the mount probe ----------------------------------------------------------
// It is handed the declaration the roster walk already read, and adds only the two
// reads this question needs on top of it. Dormancy and coverage are decided before it
// is ever called (check-fleet-roster.mjs), which is why nothing here tests them.

function contentsGh(files) {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    const m = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(path);
    const key = m && `${m[1]}:${m[2]}`;
    if (!m || !(key in files)) return { status: 404, json: null };
    return { status: 200, json: { content: Buffer.from(JSON.stringify(files[key])).toString('base64') } };
  };
  return { gh, seen };
}

test('probeMount: reads the scheduler and the compare, and never re-reads the declaration', async () => {
  const { gh, seen } = contentsGh({});
  const p = await probeMount(gh, 'o/awake', { claudinite: { ref: 'abc' } }, { canonRepo: 'o/canon', canonBranch: 'main' });
  assert.equal(p.stampedRef, 'abc');
  assert.equal(p.hasScheduler, false);           // the fake serves no workflow file
  assert.equal(seen.length, 2, 'scheduler workflow + canon compare — the declaration came from the walk');
  assert.equal(seen.filter((s) => s.includes('.claudinite-checks.json')).length, 0);
});

test('probeMount: a member with no stamp is never compared against canon', async () => {
  const { gh, seen } = contentsGh({});
  const p = await probeMount(gh, 'o/unvendored', { packs: [] }, { canonRepo: 'o/canon', canonBranch: 'main' });
  assert.equal(p.stampedRef, null);
  assert.equal(seen.length, 1, 'there is no ref to compare, so no compare is made');
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

test('convergeDrift: the body marker still spells the retired task name', async () => {
  // Every drift issue open in the enforcer right now carries `fleet-freshness` in its
  // marker. Renaming it to match the merged task would read all of them as
  // `unrecorded` and comment a spurious verdict change on the first run after the
  // merge — so the marker is frozen, and this is the test that keeps it frozen.
  const { gh, calls } = fakeGh([]);
  await convergeDrift(gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] });
  assert.match(calls[0].body.body, /<!-- fleet-freshness: behind -->/);

  const migrated = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  assert.deepEqual(await convergeDrift(migrated.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] }), [],
    'an issue written by the old fleet-freshness task is read, not re-opened as unrecorded');
});

test('convergeDrift: opens one issue per newly-unhealthy member', async () => {
  const { gh, calls } = fakeGh([]);
  const actions = await convergeDrift(gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] });
  assert.deepEqual(actions, ['opened #99 (o/a: behind)']);
  assert.equal(calls[0].body.labels[0], 'fleet-drift');
});

test('convergeDrift: an unchanged verdict is silent; a changed one updates and comments once', async () => {
  // The silence is what lets the merged task carry this question daily rather than
  // weekly: a fleet slow to heal would otherwise get an identical note every morning.
  const same = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  assert.deepEqual(await convergeDrift(same.gh, 'o/home', { ...empty, unhealthy: [verdict('o/a', 'behind')] }), []);
  assert.deepEqual(same.calls, [], 'a daily sweep must not re-comment the same story');

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

test('convergeDrift: a member that goes dormant has its open drift issue closed as not planned', async () => {
  // Not `completed`: nobody repaired the drift, the repo left the race. And not
  // left open either — an issue nagging a repo for obeying its own declaration is
  // exactly the ceremony dormancy exists to stop.
  const { gh, calls } = fakeGh([issue(7, 'o/a', 'open', 'behind')]);
  const actions = await convergeDrift(gh, 'o/home', { ...empty, dormantSet: new Set(['o/a']) });
  assert.equal(actions.length, 1);
  assert.match(actions[0], /^closed #7 \(o\/a: has declared itself dormant/);
  assert.equal(calls.at(-1).body.state_reason, 'not_planned');
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

// --- the run summary ----------------------------------------------------------
// The freshness section is a FULL-fleet roster: fresh members are named with how
// fresh, out-of-scope repos with why, and the two repos it never measures (the
// enforcer and canon) are named rather than silently absent. Pure renderer, so the
// property is testable without a network.

const summaryInput = {
  owner: 'o',
  home: 'o/sheepdog',
  canonRepo: 'o/Claudinite',
  canonBranch: 'main',
  staleDays: 14,
  fresh: [{ fullName: 'o/alpha', detail: 'at canon head' }, { fullName: 'o/beta', detail: '2 canon commit(s) behind, within the 14-day window' }],
  unhealthy: [{ fullName: 'o/late', state: 'behind', detail: 'stamped 20 days ago' }],
  dormant: ['o/asleep'],
  outOfScope: ['o/attic (archived)', 'o/naked (uncovered — the adoption half\'s subject)', 'o/left-out (excluded)'],
  unknown: ['o/flaky — probe returned 500'],
  actions: [],
};

test('freshness summary: every repo appears by name, whatever its state', () => {
  const out = renderFreshnessSummary(summaryInput);
  for (const repo of ['o/alpha', 'o/beta', 'o/late', 'o/asleep', 'o/attic', 'o/naked', 'o/left-out', 'o/flaky']) {
    assert.ok(out.includes(repo), `${repo} must be named in the summary`);
  }
  // The two it never measures are still accounted for, with why.
  assert.match(out, /\*\*Not measured:\*\* `o\/sheepdog` — the enforcer.*`o\/Claudinite` — canon/);
});

test('freshness summary: fresh members carry their detail, out-of-scope their reason', () => {
  const out = renderFreshnessSummary(summaryInput);
  assert.match(out, /`o\/alpha` — at canon head/);
  assert.match(out, /`o\/beta` — 2 canon commit\(s\) behind/);
  assert.match(out, /o\/attic \(archived\)/);
  assert.match(out, /o\/naked \(uncovered/);
});

test('freshness summary: canon named once when the enforcer IS canon', () => {
  const out = renderFreshnessSummary({ ...summaryInput, canonRepo: 'o/sheepdog' });
  assert.match(out, /\*\*Not measured:\*\* `o\/sheepdog` — the enforcer/);
  assert.equal(out.match(/— canon, with no vendored mount/g), null);
});

test('freshness summary: empty states say none rather than vanishing', () => {
  const out = renderFreshnessSummary({ ...summaryInput, fresh: [], unhealthy: [] });
  assert.match(out, /\*\*Fresh:\*\* none/);
  assert.match(out, /\*\*Every covered member is up to date 🎉\*\*/);
});
