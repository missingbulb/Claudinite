import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFreshness, convergeDrift, probe, renderFreshnessSummary, FRESH,
  versionGap, parseEngineVersion, parsePackVersion, makeCanonVersions, fixesKey,
} from '../../../../packs/sheepdog/tasks/fleet-freshness/check-fleet-freshness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

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

// --- the version measure (#786) -----------------------------------------------
// A member served by the update flows has a FROZEN ref by design — those flows
// stamp versions and never write `ref` or `updated`. Measuring its age would report
// every healthy member as drifting once canon moved past the commit baselining last
// wrote, which is the bug this measure exists to remove.

const versioned = (over) => classifyFreshness({
  mechanism: 'updates', hasScheduler: true, stampedRef: 'frozen',
  installed: { engineVersion: 2, packVersions: { basics: 1 } },
  canon: { engineVersion: 2, packVersions: { basics: 1 } },
  nowMs: NOW, staleDays: 14, ...over,
});

test('classifyFreshness: an updates member at canon\'s versions is fresh however old its ref', () => {
  // The exact shape that used to read as drift: a ref a year stale, canon far ahead
  // of it — and nothing wrong, because the versions are current.
  const v = versioned({ compare: ancestor(500, 365) });
  assert.equal(v.state, FRESH);
  assert.match(v.detail, /engine 2/);
});

test('classifyFreshness: an updates member behind on any component is behind, and names it', () => {
  const engine = versioned({ canon: { engineVersion: 3, packVersions: { basics: 1 } } });
  assert.equal(engine.state, 'behind');
  assert.match(engine.detail, /engine 2 → 3/);

  const pack = versioned({ canon: { engineVersion: 2, packVersions: { basics: 4 } } });
  assert.equal(pack.state, 'behind');
  assert.match(pack.detail, /basics 1 → 4/);
  assert.ok(!pack.detail.includes('engine'), 'a component that is current is not news');
});

test('classifyFreshness: the date measure never runs on a version-measured member', () => {
  // Both date-only verdicts must be unreachable: the ref is frozen, so an off-trunk
  // or long-stale reading of it is an answer to a question that no longer applies.
  assert.equal(versioned({ compare: null }).state, FRESH, 'no compare is even consulted');
  assert.equal(versioned({ compare: { status: 'diverged', aheadBy: 0, baseDateMs: NOW } }).state, FRESH);
  // …while the same member on baselining is judged exactly as before.
  assert.equal(versioned({ mechanism: 'baselining', compare: null }).state, 'ref-not-on-trunk');
});

test('classifyFreshness: never vendored is asked of whichever field the mechanism writes', () => {
  // A repo installed under the update flows may never have carried a ref at all.
  assert.equal(versioned({ stampedRef: null }).state, FRESH, 'versions are the stamp here');
  // Neither field → genuinely never vendored, under either mechanism.
  assert.equal(versioned({ stampedRef: null, installed: { packVersions: {} } }).state, 'no-stamp');
  assert.equal(classify({ stampedRef: null }).state, 'no-stamp');
});

test('versionGap compares only what canon states a number for', () => {
  const gaps = versionGap({
    installed: { engineVersion: 1, packVersions: { basics: 1, 'local/thing': 9, retired: 3 } },
    canon: { engineVersion: 2, packVersions: { basics: 2 } },
  });
  assert.deepEqual(gaps, ['engine 1 → 2', 'basics 1 → 2']);
  // A repo-owned local pack has no canon version to be behind, and a pack canon has
  // since dropped is not the member's drift either — both simply absent from canon.
  assert.ok(!gaps.join(' ').includes('local/thing'));
  assert.ok(!gaps.join(' ').includes('retired'));
  // Ahead of canon is not behind (a member mid-rollout of a pack canon just reverted).
  assert.deepEqual(versionGap({ installed: { engineVersion: 5, packVersions: {} }, canon: { engineVersion: 2 } }), []);
  // Unstamped reads as unstamped, never as version zero.
  assert.deepEqual(versionGap({ installed: {}, canon: { engineVersion: 2 } }), ['engine unstamped → 2']);
});

test('the version parsers read canon\'s REAL declarations, not a shape they invented', () => {
  // The measure is only as good as these two regexes, and the files they read are
  // maintained by other flows entirely — an engine release rewrites the first, a pack
  // release the second. Parsing this repo's own files is what catches a reformat.
  assert.equal(
    parseEngineVersion(readFileSync(join(ROOT, 'engine', 'version.mjs'), 'utf8')),
    Number(/ENGINE_VERSION = (\d+)/.exec(readFileSync(join(ROOT, 'engine', 'version.mjs'), 'utf8'))[1]));
  assert.ok(parseEngineVersion(readFileSync(join(ROOT, 'engine', 'version.mjs'), 'utf8')) >= 1);
  assert.equal(parsePackVersion(readFileSync(join(ROOT, 'packs', 'basics', 'pack.mjs'), 'utf8')), 1);
  assert.equal(parsePackVersion(readFileSync(join(ROOT, 'packs', 'sheepdog', 'pack.mjs'), 'utf8')), 1);
  // A file that states no version yields null — "canon says nothing", never zero.
  assert.equal(parsePackVersion('export default { id: \'x\' }\n'), null);
  assert.equal(parseEngineVersion('nothing here'), null);
  // And a nested `version:` deeper in a manifest is not mistaken for the pack's own.
  assert.equal(parsePackVersion('export default {\n  id: \'x\',\n  config: {\n    version: 9,\n  },\n};\n'), null);
});

test('canon versions are read once per artifact, however many members ask', async () => {
  let reads = 0;
  const gh = async (path) => {
    reads += 1;
    const body = path.includes('engine/version.mjs')
      ? 'export const ENGINE_VERSION = 7;\n'
      : 'export default {\n  id: \'basics\',\n  version: 3,\n};\n';
    return { status: 200, json: { content: Buffer.from(body).toString('base64') } };
  };
  const canon = makeCanonVersions(gh, 'o/canon');
  const installed = { engineVersion: 1, packVersions: { basics: 1 } };
  assert.deepEqual(await canon.forInstalled(installed), { engineVersion: 7, packVersions: { basics: 3 } });
  assert.equal(reads, 2, 'engine + one pack');
  // A second member carrying the same packs costs nothing — the point of the cache,
  // since the fleet shares one canon and most of its packs.
  await canon.forInstalled(installed);
  await canon.forInstalled(installed);
  assert.equal(reads, 2, 'the cache is what keeps this from being a read per member per pack');
});

test('a version-measured drift issue does not offer a window there is nothing to tune', () => {
  assert.equal(fixesKey('behind', 'updates'), 'behind-versions');
  assert.equal(fixesKey('behind', 'baselining'), 'behind');
  // Only the shared symptom forks; a root cause reads the same under both measures.
  assert.equal(fixesKey('no-scheduler', 'updates'), 'no-scheduler');
});

// --- dormancy -----------------------------------------------------------------
// A dormant member's scheduler stops before it evaluates anything, so its mount
// falls behind BY DESIGN. Every state above would fire on it, and each would be a
// report that the repo did what it was told. The probe stops at the declaration.

// A fake contents API over `{ '<owner/repo>:<path>': <object|404> }`.
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

test('probe: a member that declares itself dormant is never classified', async () => {
  const { gh, seen } = contentsGh({
    'o/asleep:.claudinite-checks.json': { packs: ['basics'], dormant: true, claudinite: { ref: 'old' } },
  });
  assert.deepEqual(await probe(gh, 'o/asleep', { canonRepo: 'o/canon', canonBranch: 'main' }), { dormant: true });
  // …and the stamp it carries — deliberately stale here — is not even looked up
  // against canon: no scheduler-workflow read, no compare.
  assert.deepEqual(seen, ['/repos/o/asleep/contents/.claudinite-checks.json']);
});

test('probe: an ordinary member is still probed in full', async () => {
  // The negative that keeps the dormancy gate honest — dormancy is opt-in, and
  // absence of the key must leave the sweep exactly as it was. Since #768 Phase 5 an
  // undeclared member is served by `updates` (the only mechanism left), so "in full"
  // now means the VERSION path: declaration, scheduler workflow, and canon's versions
  // rather than a compare against a ref no flow writes any more.
  const { gh, seen } = contentsGh({
    'o/awake:.claudinite-checks.json': { packs: ['basics'], claudinite: { ref: 'abc', engineVersion: 2 } },
  });
  const canonVersions = { forInstalled: async () => ({ engineVersion: 2, packVersions: {} }) };
  const p = await probe(gh, 'o/awake', { canonRepo: 'o/canon', canonBranch: 'main', canonVersions });
  assert.equal(p.dormant, undefined);
  assert.equal(p.mechanism, 'updates', 'the default is the only mechanism there is');
  assert.equal(p.stampedRef, 'abc');
  assert.equal(p.hasScheduler, false);           // the fake serves no workflow file
  assert.equal(seen.length, 2, 'declaration + scheduler workflow; no compare on a frozen ref');
});

test('probe: an updates member asks canon for versions and never for the compare', async () => {
  const { gh, seen } = contentsGh({
    'o/flipped:.claudinite-checks.json': {
      packs: ['basics'],
      maintenance: { delivery: 'auto-merge', mechanism: 'updates' },
      claudinite: { ref: 'frozen', engineVersion: 2, packVersions: { basics: 1 } },
    },
    'o/flipped:.github/workflows/claudinite-scheduler.yml': {},
  });
  const canonVersions = { forInstalled: async (i) => ({ engineVersion: 9, packVersions: { basics: i.packVersions.basics } }) };
  const p = await probe(gh, 'o/flipped', { canonRepo: 'o/canon', canonBranch: 'main', canonVersions });

  assert.equal(p.mechanism, 'updates');
  assert.deepEqual(p.installed, { engineVersion: 2, packVersions: { basics: 1 } });
  assert.equal(p.canon.engineVersion, 9);
  assert.equal(p.compare, null);
  assert.ok(!seen.some((s) => s.includes('/compare/')), 'a frozen ref is never compared against canon');
  assert.equal(classifyFreshness({ ...p, nowMs: NOW, staleDays: 14 }).state, 'behind');
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
// The sweep's report is a FULL-fleet roster: fresh members are named with how
// fresh, out-of-scope repos with why, and the two repos the sweep never measures
// (the enforcer and canon) are named rather than silently absent. Pure renderer,
// so the property is testable without a network.

const summaryInput = {
  owner: 'o',
  home: 'o/sheepdog',
  canonRepo: 'o/Claudinite',
  canonBranch: 'main',
  staleDays: 14,
  fresh: [{ fullName: 'o/alpha', detail: 'at canon head' }, { fullName: 'o/beta', detail: '2 canon commit(s) behind, within the 14-day window' }],
  unhealthy: [{ fullName: 'o/late', state: 'behind', detail: 'stamped 20 days ago' }],
  dormant: ['o/asleep'],
  outOfScope: ['o/attic (archived)', 'o/naked (uncovered — the census\'s subject)', 'o/left-out (excluded)'],
  unknown: ['o/flaky — probe returned 500'],
  actions: [],
};

test('freshness summary: every repo appears by name, whatever its state', () => {
  const out = renderFreshnessSummary(summaryInput);
  for (const repo of ['o/alpha', 'o/beta', 'o/late', 'o/asleep', 'o/attic', 'o/naked', 'o/left-out', 'o/flaky']) {
    assert.ok(out.includes(repo), `${repo} must be named in the summary`);
  }
  // The two the sweep never measures are still accounted for, with why.
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
