import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFreshness, convergeDrift, probeMount, canonVersions, renderFreshnessSummary, FRESH,
} from '../../../../packs/sheepdog/tasks/fleet-roster/drift-issues.mjs';

// The freshness question's whole judgement is `classifyFreshness` — pure, so every
// branch is exercised here without a network. The precedence between states is the
// point of the function, not an accident of the if-chain: a member with no scheduler
// is ALSO behind, and reporting "behind" would send the reader chasing a symptom.
//
// What it does NOT read is the AGE of the stamped ref. The versioned flows never
// rewrite `ref`, so on a well-maintained member the stamp is frozen and its age
// measures nothing — a date measure calls the whole fleet behind on one arbitrary
// day (#1025). The verdict is the version gap and only the version gap.

const ancestor = (status = 'identical') => ({ status });
const stamp = (over = {}) => ({ engineVersion: 4, packVersions: { basics: 7 }, ...over });
const canon = (over = {}) => ({ engineVersion: 4, packVersions: { basics: 7 }, ...over });
const classify = (over) => classifyFreshness({
  stampedRef: 'abc123', hasScheduler: true, compare: ancestor(), installed: stamp(), canon: canon(), ...over,
});

test('classifyFreshness: a member at canon versions is fresh however old its stamp', () => {
  const v = classify({});
  assert.equal(v.state, FRESH);
  assert.match(v.detail, /engine v4/);
  // The stamp is frozen by design, so an ancient ref with 900 canon commits on top
  // of it is the NORMAL state of a healthy member, not a finding.
  assert.equal(classify({ compare: { status: 'ahead' } }).state, FRESH);
});

test('classifyFreshness: behind is a version gap, and the gap is named', () => {
  const engine = classify({ installed: stamp({ engineVersion: 3 }) });
  assert.equal(engine.state, 'behind');
  assert.match(engine.detail, /engine v3 → v4/);

  const pack = classify({ installed: stamp({ packVersions: { basics: 5, core: 7 } }), canon: canon({ packVersions: { basics: 7, core: 7 } }) });
  assert.equal(pack.state, 'behind');
  assert.match(pack.detail, /basics v5 → v7/);
  assert.doesNotMatch(pack.detail, /core/, 'a pack already at canon is not part of the gap');

  const both = classify({ installed: stamp({ engineVersion: 3, packVersions: { basics: 5 } }) });
  assert.match(both.detail, /engine v3 → v4.*basics v5 → v7/);
});

test('classifyFreshness: a pack ahead of canon, or gone from canon, is not a gap', () => {
  // A pack version above canon's happens mid-release; it is not "behind".
  assert.equal(classify({ installed: stamp({ packVersions: { basics: 9 } }) }).state, FRESH);
  // A pack retired from canon has no manifest to compare against — canon carries no
  // entry for it, and an absent number must never read as zero.
  assert.equal(classify({ installed: stamp({ packVersions: { basics: 7, retired: 3 } }) }).state, FRESH);
  // Neither does a stamped value that is not a number at all.
  assert.equal(classify({ installed: stamp({ packVersions: { basics: 'seven' } }) }).state, FRESH);
});

test('classifyFreshness: a stamp the versioned flows never wrote is behind by construction', () => {
  const v = classify({ installed: { engineVersion: null, packVersions: {} } });
  assert.equal(v.state, 'behind');
  assert.match(v.detail, /no engineVersion/);
  // A member declaring only local packs stamps an engine version and no pack ones —
  // versioned, and fresh.
  assert.equal(classify({ installed: { engineVersion: 4, packVersions: {} }, canon: canon({ packVersions: {} }) }).state, FRESH);
});

test('classifyFreshness: an off-trunk stamp is a wedge, not a delay', () => {
  // not a canon commit at all (canon's compare 404s)
  assert.equal(classify({ compare: null }).state, 'ref-not-on-trunk');
  // a canon commit, but not an ancestor of the default branch — what #328 refuses
  for (const status of ['diverged', 'behind']) {
    const v = classify({ compare: { status } });
    assert.equal(v.state, 'ref-not-on-trunk', status);
    assert.match(v.detail, new RegExp(status));
  }
});

test('classifyFreshness: root cause wins over symptom', () => {
  // no scheduler AND behind → no-scheduler, because the missing cron is WHY
  assert.equal(classify({ hasScheduler: false, installed: stamp({ engineVersion: 1 }) }).state, 'no-scheduler');
  // no stamp outranks even that: nothing was ever vendored
  assert.equal(classify({ stampedRef: null, hasScheduler: false }).state, 'no-stamp');
  // and an unvendored repo is never asked about trunk
  assert.equal(classify({ stampedRef: null, compare: null }).state, 'no-stamp');
});

// --- canon's own versions -----------------------------------------------------
// The numbers a member is measured against are read out of CANON, not out of the
// enforcer's own mount — which is itself a member and can be behind.

function textGh(files) {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    const m = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(path);
    const key = m && `${m[1]}:${decodeURI(m[2])}`;
    if (!m || !(key in files)) return { status: 404, json: null };
    return { status: 200, json: { content: Buffer.from(files[key]).toString('base64') } };
  };
  return { gh, seen };
}

const CANON_FILES = {
  'o/canon:engine/version.mjs': '// a comment mentioning ENGINE_VERSION\nexport const ENGINE_VERSION = 4;\n',
  'o/canon:packs/basics/pack.mjs': 'export default {\n  id: \'basics\',\n  version: 7,\n  minEngineVersion: 1,\n};\n',
};

test('canonVersions: reads engine and pack manifests once each, however many members ask', async () => {
  const { gh, seen } = textGh(CANON_FILES);
  const v = canonVersions(gh, 'o/canon');
  assert.equal(await v.engine(), 4);
  assert.equal(await v.engine(), 4);
  assert.equal(await v.pack('basics'), 7);
  assert.equal(await v.pack('basics'), 7);
  assert.equal(seen.length, 2, 'a fleet of 30 members must not re-read canon 30 times');
});

test('canonVersions: a pack canon no longer carries reads as absent, not as zero', async () => {
  const { gh } = textGh(CANON_FILES);
  assert.equal(await canonVersions(gh, 'o/canon').pack('retired'), null);
});

test('canonVersions: a manifest whose version cannot be read throws rather than guessing', async () => {
  const { gh } = textGh({ ...CANON_FILES, 'o/canon:packs/odd/pack.mjs': 'export default { id: "odd" };\n' });
  await assert.rejects(() => canonVersions(gh, 'o/canon').pack('odd'), /odd/);
  const noEngine = textGh({});
  await assert.rejects(() => canonVersions(noEngine.gh, 'o/canon').engine(), /version\.mjs/);
});

// --- the mount probe ----------------------------------------------------------
// It is handed the declaration the roster walk already read, and adds only the reads
// this question needs on top of it. Dormancy and coverage are decided before it is
// ever called (check-fleet-roster.mjs), which is why nothing here tests them.

const probeOpts = (gh) => ({ canonRepo: 'o/canon', canonBranch: 'main', canon: canonVersions(gh, 'o/canon') });

test('probeMount: reads the scheduler, the compare and canon\'s versions, never the declaration again', async () => {
  const { gh, seen } = textGh(CANON_FILES);
  const decl = { claudinite: { ref: 'abc', engineVersion: 3, packVersions: { basics: 7 } } };
  const p = await probeMount(gh, 'o/awake', decl, probeOpts(gh));
  assert.equal(p.stampedRef, 'abc');
  assert.equal(p.hasScheduler, false);           // the fake serves no workflow file
  assert.deepEqual(p.installed, { engineVersion: 3, packVersions: { basics: 7 } });
  assert.deepEqual(p.canon, { engineVersion: 4, packVersions: { basics: 7 } });
  assert.equal(seen.filter((s) => s.includes('.claudinite-checks.json')).length, 0);
});

test('probeMount: a member with no stamp is never compared against canon', async () => {
  const { gh, seen } = textGh(CANON_FILES);
  const p = await probeMount(gh, 'o/unvendored', { packs: [] }, probeOpts(gh));
  assert.equal(p.stampedRef, null);
  assert.equal(seen.length, 1, 'there is no stamp to measure, so nothing but the scheduler is read');
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
const empty = { unhealthy: [], healthySet: new Set(), goneSet: new Set() };

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
  fresh: [{ fullName: 'o/alpha', detail: 'engine v4, 9 declared pack(s) at canon versions' }, { fullName: 'o/beta', detail: 'engine v4, 3 declared pack(s) at canon versions' }],
  unhealthy: [{ fullName: 'o/late', state: 'behind', detail: 'engine v3 → v4' }],
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
  assert.match(out, /`o\/alpha` — engine v4, 9 declared pack\(s\) at canon versions/);
  assert.match(out, /`o\/beta` — engine v4, 3 declared pack\(s\) at canon versions/);
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
