// Run with `node --test packs-tests/sheepdog/tasks/fleet-digest/*.test.mjs`.
//
// The collector is the half of fleet-digest that must not need an agent to be right,
// so this is where the load-bearing behaviour is pinned: the maintenance filter (the
// one thing standing between the owner and a brief that reports the scheduler back to
// them as their own work), the ranking, the shortlist bound, and the nudge's refusal
// to measure activity on pushes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDay, enumerateMembers, isMaintenance, isMachineIssue, prWeight, issueWeight, pickNudge, previousDay,
} from '../../../../packs/sheepdog/tasks/fleet-digest/collect-fleet-day.mjs';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const DECL = JSON.stringify({ packs: ['basics'] });

// A fake `gh` over a route table. Keys are matched as prefixes of the request path,
// longest first, so the PR-detail route can sit under the PR-list route.
function fakeGh(routes) {
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const calls = [];
  const gh = async (path) => {
    calls.push(path);
    for (const k of keys) {
      if (path.startsWith(k)) {
        const v = typeof routes[k] === 'function' ? routes[k](path) : routes[k];
        return v.status ? v : { status: 200, json: v };
      }
    }
    return { status: 404, json: null };
  };
  gh.calls = calls;
  return gh;
}

const repoRow = (name, extra = {}) => ({
  full_name: `acme/${name}`, owner: { login: 'acme' }, archived: false, fork: false, ...extra,
});

const pr = (n, o = {}) => ({
  number: n,
  title: o.title ?? `PR ${n}`,
  html_url: `https://example/pr/${n}`,
  merged_at: o.merged_at ?? '2026-08-08T12:00:00Z',
  updated_at: o.updated_at ?? o.merged_at ?? '2026-08-08T12:00:00Z',
  head: { ref: o.ref ?? 'feature/x' },
  user: { login: o.login ?? 'ariel', type: o.type ?? 'User' },
  ...o,
});

test('maintenance PRs are recognised by branch, by title, and by author', () => {
  assert.ok(isMaintenance(pr(1, { ref: 'claudinite/fleet-usage/2026-08-08' })), 'engine branch');
  assert.ok(isMaintenance(pr(2, { title: 'Claudinite: recompute the aggregate' })), 'engine title');
  assert.ok(isMaintenance(pr(3, { type: 'Bot' })), 'a bot author');
  assert.ok(isMaintenance(pr(4, { login: 'dependabot[bot]' })), 'a bot login');
});

test('the fleet\'s own dispatch issues are machine-filed, not accomplishments', () => {
  // Regression, from the first real backfill: three of one day's six shortlist slots
  // were `[claudinite-task]` issues. They do not merely appear — they WIN, because an
  // issue's weight counts its discussion and the executor comments on every stage.
  assert.ok(isMachineIssue({ title: '[claudinite-task] grow_with_claudinite/growth-extract d2026-07-26' }));
  assert.ok(isMachineIssue({ title: '[claudinite-task] chrome-extension-release/store-release d2026-07-26' }));
  assert.ok(isMachineIssue({ title: 'Claudinite scheduler run failed' }), 'the escalation issue too');
  assert.ok(isMachineIssue({ title: 'Anything', user: { type: 'Bot' } }));
  assert.ok(isMachineIssue({ title: 'Anything', user: { login: 'dependabot[bot]' } }));
});

test('a person\'s issue is still a person\'s issue', () => {
  assert.equal(isMachineIssue({ title: 'Prices are wrong for split performances', user: { login: 'ariel', type: 'User' } }), false);
  assert.equal(isMachineIssue({ title: 'Add a task that reports the fleet\'s day', user: { login: 'ariel', type: 'User' } }), false);
  assert.equal(isMachineIssue({}), false, 'a bare issue is not machine-filed by default');
});

test('a human PR that happens to touch the mount is NOT maintenance', () => {
  // The right way round: deciding how the fleet maintains itself is real work.
  assert.equal(isMaintenance(pr(5, { title: 'Rework how baselining stamps the mount', ref: 'ariel/stamp' })), false);
});

test('weights put a big change above a small one, and a discussed issue above a drive-by', () => {
  assert.ok(prWeight({ additions: 900, deletions: 40 }) > prWeight({ additions: 2, deletions: 1 }));
  assert.ok(issueWeight({ title: 'x', body: 'y'.repeat(4000), comments: 12 })
    > issueWeight({ title: 'x', body: 'typo', comments: 0 }));
  assert.equal(prWeight({}), 0, 'a PR with no size data ranks last, never NaN');
});

test('enumerateMembers keeps covered actives and names why it dropped the rest', async () => {
  const gh = fakeGh({
    '/user/repos': [repoRow('live'), repoRow('old', { archived: true }), repoRow('forked', { fork: true }),
      repoRow('nope'), repoRow('parked'), repoRow('banned')],
    '/repos/acme/live/contents/': { content: b64(DECL) },
    '/repos/acme/parked/contents/': { content: b64(JSON.stringify({ packs: ['basics'], dormant: true })) },
    '/repos/acme/nope/contents/': { status: 404, json: null },
  });
  const { members, skipped } = await enumerateMembers(gh, { owner: 'acme', exclude: new Set(['acme/banned']) });
  assert.deepEqual(members, ['acme/live']);
  assert.ok(skipped.some((s) => s.includes('acme/old (archived)')));
  assert.ok(skipped.some((s) => s.includes('acme/forked (fork)')));
  assert.ok(skipped.some((s) => s.includes('acme/nope (uncovered)')));
  assert.ok(skipped.some((s) => s.includes('acme/parked (dormant)')));
  assert.ok(skipped.some((s) => s.includes('acme/banned (excluded)')));
});

test('an empty enumeration is a broken token, not an empty fleet', async () => {
  const gh = fakeGh({ '/user/repos': [] });
  await assert.rejects(() => enumerateMembers(gh, { owner: 'acme', exclude: new Set() }), /wrong token user or scope/);
});

// --- the full day -----------------------------------------------------------

const DAY = '2026-08-08';
const NOW = '2026-08-09T05:00:00Z';

function fleetRoutes({ prs = [], issues = [], details = {} } = {}) {
  return {
    '/user/repos': [repoRow('one')],
    '/repos/acme/one/contents/': { content: b64(DECL) },
    '/repos/acme/one/pulls?': prs,
    '/repos/acme/one/issues?': issues,
    '/repos/acme/one/pulls/': (p) => ({ status: 200, json: details[Number(p.split('/').pop())] ?? {} }),
  };
}

const collect = (routes, over = {}) => collectDay(fakeGh(routes), {
  owner: 'acme',
  exclude: new Set(),
  date: DAY,
  now: NOW,
  shortlist: 6,
  nudge: { enabled: true, quietDays: 7 },
  ...over,
});

test('the day ranks by size, shortlists the head, and counts maintenance separately', async () => {
  const day = await collect(fleetRoutes({
    prs: [
      pr(1, { title: 'small' }),
      pr(2, { title: 'huge' }),
      pr(3, { title: 'Claudinite: converge the mount', ref: 'claudinite/maintenance/x' }),
      pr(4, { title: 'last week', merged_at: '2026-08-01T12:00:00Z' }),
    ],
    details: {
      1: { additions: 3, deletions: 1, changed_files: 1, body: 'tiny' },
      2: { additions: 900, deletions: 120, changed_files: 22, body: 'big rework' },
    },
  }), { shortlist: 1 });

  assert.equal(day.maintenance, 1, 'the engine PR is counted, not ranked');
  assert.equal(day.considered, 2, 'only the two human PRs merged IN the window');
  assert.deepEqual(day.shortlist.map((i) => i.number), [2], 'the biggest, and only as many as asked for');
  assert.equal(day.shortlist[0].weight, 1020);
  assert.equal(day.shortlist[0].files, 22);
});

test('issues closed in the window rank alongside PRs; ones merely updated do not', async () => {
  const day = await collect(fleetRoutes({
    prs: [pr(1)],
    details: { 1: { additions: 5, deletions: 0 } },
    issues: [
      { number: 10, title: 'long argued issue', body: 'x'.repeat(4000), comments: 9, closed_at: '2026-08-08T09:00:00Z', html_url: 'u' },
      { number: 11, title: 'closed last month', body: 'x', comments: 0, closed_at: '2026-07-02T09:00:00Z', html_url: 'u' },
      { number: 12, title: 'a PR in issue clothing', body: 'x', comments: 0, closed_at: '2026-08-08T09:00:00Z', pull_request: {}, html_url: 'u' },
      { number: 13, title: 'still open, just touched', body: 'x', comments: 0, closed_at: null, html_url: 'u' },
    ],
  }));
  assert.deepEqual(day.shortlist.map((i) => `${i.kind}${i.number}`), ['issue10', 'pr1'],
    'the substantial issue outranks the tiny PR, and the other three are not closures in this window');
});

test('a dispatch issue is counted as machine-filed and never shortlisted', async () => {
  const day = await collect(fleetRoutes({
    prs: [pr(1)],
    details: { 1: { additions: 5, deletions: 0 } },
    issues: [
      // Weighted far above the real PR by its executor comment thread — exactly how it
      // crowded out real work before the filter existed.
      { number: 20, title: '[claudinite-task] basics/baselining d2026-08-08', body: 'x'.repeat(3000), comments: 25, closed_at: '2026-08-08T09:00:00Z', html_url: 'u' },
      { number: 21, title: 'A real bug someone hit', body: 'x'.repeat(100), comments: 1, closed_at: '2026-08-08T09:00:00Z', html_url: 'u' },
    ],
  }));
  assert.deepEqual(day.shortlist.map((i) => i.number), [21, 1], 'the dispatch issue is gone, despite outweighing both');
  assert.equal(day.maintenance, 1, 'and it is reported, not silently dropped');
  assert.equal(day.considered, 2);
});

test('a day with nothing in it shortlists nothing — the caller writes the quiet brief', async () => {
  const day = await collect(fleetRoutes({ prs: [pr(1, { title: 'Claudinite: nightly', ref: 'claudinite/x' })] }));
  assert.deepEqual(day.shortlist, []);
  assert.equal(day.considered, 0);
  assert.equal(day.maintenance, 1);
});

test('bodies travel with the shortlist, truncated — the agent is told to read text, so it must have it', async () => {
  const day = await collect(fleetRoutes({
    prs: [pr(1)],
    details: { 1: { additions: 10, deletions: 0, body: 'y'.repeat(4000) } },
  }));
  assert.ok(day.shortlist[0].body.length < 1700, 'truncated');
  assert.match(day.shortlist[0].body, /\[truncated\]$/);
});

// --- the nudge --------------------------------------------------------------

const lastMap = (o) => new Map(Object.entries(o).map(([k, v]) => [k, { at: new Date(v), title: 't', number: 1, url: 'u' }]));

test('the nudge picks a quiet member and reports its last meaningful change', () => {
  const n = pickNudge({
    members: ['acme/busy', 'acme/quiet'],
    lastMeaningful: lastMap({ 'acme/busy': '2026-08-08T00:00:00Z', 'acme/quiet': '2026-07-01T00:00:00Z' }),
    quietFrom: new Date('2026-08-02T00:00:00Z'),
    date: DAY,
  });
  assert.equal(n.repo, 'acme/quiet');
  assert.equal(n.last.at, '2026-07-01T00:00:00.000Z');
});

test('a member whose only activity is maintenance still counts as quiet', async () => {
  // The whole reason the nudge does not read pushed_at: baselining pushes to every
  // member every night, so every repo in the fleet looks active forever.
  const day = await collect(fleetRoutes({
    prs: [pr(1, { title: 'Claudinite: converge', ref: 'claudinite/maintenance/x', merged_at: '2026-08-08T01:00:00Z' })],
  }));
  assert.equal(day.nudge.repo, 'acme/one');
  assert.equal(day.nudge.last, null, 'nothing meaningful found in the lookback');
});

test('no quiet member means no nudge, and the switch means no nudge either', async () => {
  const active = await collect(fleetRoutes({ prs: [pr(1)], details: { 1: { additions: 5, deletions: 0 } } }));
  assert.equal(active.nudge, null, 'the only member merged something yesterday');

  const off = await collect(fleetRoutes({}), { nudge: { enabled: false, quietDays: 7 } });
  assert.equal(off.nudge, null);
});

test('the same date always nominates the same project', () => {
  const args = {
    members: ['a/one', 'a/two', 'a/three', 'a/four'],
    lastMeaningful: new Map(),
    quietFrom: new Date('2026-08-02T00:00:00Z'),
  };
  const first = pickNudge({ ...args, date: DAY }).repo;
  assert.equal(pickNudge({ ...args, date: DAY }).repo, first, 'a re-run reproduces the brief');
  assert.ok(args.members.includes(first));
  // …and a different day is free to nominate a different one.
  const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
  assert.ok(new Set(dates.map((d) => pickNudge({ ...args, date: d }).repo)).size > 1, 'it does rotate');
});

test('previousDay is the UTC day before, across a month boundary', () => {
  assert.equal(previousDay('2026-08-09T05:00:00Z'), '2026-08-08');
  assert.equal(previousDay('2026-08-01T00:10:00Z'), '2026-07-31');
  assert.equal(previousDay('2026-01-01T04:00:00Z'), '2025-12-31');
});
