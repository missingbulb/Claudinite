import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFreshness, probeMount, canonVersions, renderFreshnessSummary, FRESH,
} from '../../../tasks/fleet-roster/freshness.mjs';

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
  hasScheduler: true, installed: stamp(), canon: canon(), ...over,
});

test('classifyFreshness: a member at canon versions is fresh', () => {
  const v = classify({});
  assert.equal(v.state, FRESH);
  assert.match(v.detail, /engine v4/);
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

// A member that records NEITHER number has never been written by an engine that
// records them, which is every engine since the versioned flows landed. That is the
// whole of `no-stamp` now: #1252 deleted the ref this used to be asked of, and with
// it `ref-not-on-trunk` — that state reported the #328 wedge, which the anti-rewind
// guard can no longer create because it compares versions and needs no ref at all.
test('classifyFreshness: a member recording no versions has never been vendored', () => {
  const v = classify({ installed: { engineVersion: null, packVersions: {} } });
  assert.equal(v.state, 'no-stamp');
  assert.match(v.detail, /no engineVersion and no pack versions/);
  // A member declaring only local packs records an engine version and no pack ones —
  // versioned, and fresh.
  assert.equal(classify({ installed: { engineVersion: 4, packVersions: {} }, canon: canon({ packVersions: {} }) }).state, FRESH);
});

test('classifyFreshness: root cause wins over symptom', () => {
  // no scheduler AND behind → no-scheduler, because the missing cron is WHY
  assert.equal(classify({ hasScheduler: false, installed: stamp({ engineVersion: 1 }) }).state, 'no-scheduler');
  // never vendored outranks even that: a repo with no mount has nothing to converge,
  // so reporting its missing cron would send the reader after the wrong thing.
  assert.equal(classify({ hasScheduler: false, installed: { engineVersion: null, packVersions: {} } }).state, 'no-stamp');
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

const probeOpts = (gh) => ({ canon: canonVersions(gh, 'o/canon') });

test('probeMount: reads the scheduler and canon\'s versions, never the declaration again', async () => {
  const { gh, seen } = textGh(CANON_FILES);
  const decl = { engineVersion: 3, packs: [{ id: 'basics', version: 7 }] };
  const p = await probeMount(gh, 'o/awake', decl, probeOpts(gh));
  assert.equal(p.hasScheduler, false);           // the fake serves no workflow file
  assert.deepEqual(p.installed, { engineVersion: 3, packVersions: { basics: 7 } });
  assert.deepEqual(p.canon, { engineVersion: 4, packVersions: { basics: 7 } });
  assert.equal(seen.filter((s) => s.includes('.claudinite-settings.json')).length, 0);
});

// The retired block is read by nothing since #1640, so a member that never ran the
// #1252 record measures as never vendored rather than as current.
test('probeMount: a member still stamped in the retired block has no versions', async () => {
  const { gh } = textGh(CANON_FILES);
  const decl = { claudinite: { updated: 'x', ref: 'abc', engineVersion: 3, packVersions: { basics: 7 } } };
  const p = await probeMount(gh, 'o/awake', decl, probeOpts(gh));
  assert.deepEqual(p.installed, { engineVersion: null, packVersions: {} });
});

test('probeMount: a member with no versions is never compared against canon', async () => {
  const { gh, seen } = textGh(CANON_FILES);
  const p = await probeMount(gh, 'o/unvendored', { packs: [] }, probeOpts(gh));
  assert.deepEqual(p.installed, { engineVersion: null, packVersions: {} });
  assert.equal(seen.length, 1, 'there is nothing to measure, so nothing but the scheduler is read');
});

// --- the run summary ----------------------------------------------------------
// The freshness section is a FULL-fleet roster: fresh members are named with how
// fresh, out-of-scope repos with why, and the two repos it never measures (the
// enforcer and canon) are named rather than silently absent. Pure renderer, so the
// property is testable without a network.

const summaryInput = {
  owner: 'o',
  home: 'o/enforcer',
  canonRepo: 'o/Claudinite',
  canonBranch: 'main',
  fresh: [{ fullName: 'o/alpha', detail: 'engine v4, 9 declared pack(s) at canon versions' }, { fullName: 'o/beta', detail: 'engine v4, 3 declared pack(s) at canon versions' }],
  unhealthy: [{ fullName: 'o/late', state: 'behind', detail: 'engine v3 → v4' }],
  dormant: ['o/asleep'],
  outOfScope: ['o/attic (archived)', 'o/naked (uncovered — the adoption half\'s subject)', 'o/left-out (excluded)'],
  unknown: ['o/flaky — probe returned 500'],
};

test('freshness summary: every repo appears by name, whatever its state', () => {
  const out = renderFreshnessSummary(summaryInput);
  for (const repo of ['o/alpha', 'o/beta', 'o/late', 'o/asleep', 'o/attic', 'o/naked', 'o/left-out', 'o/flaky']) {
    assert.ok(out.includes(repo), `${repo} must be named in the summary`);
  }
  // The two it never measures are still accounted for, with why.
  assert.match(out, /\*\*Not measured:\*\* `o\/enforcer` — the enforcer.*`o\/Claudinite` — canon/);
});

test('freshness summary: fresh members carry their detail, out-of-scope their reason', () => {
  const out = renderFreshnessSummary(summaryInput);
  assert.match(out, /`o\/alpha` — engine v4, 9 declared pack\(s\) at canon versions/);
  assert.match(out, /`o\/beta` — engine v4, 3 declared pack\(s\) at canon versions/);
  assert.match(out, /o\/attic \(archived\)/);
  assert.match(out, /o\/naked \(uncovered/);
});

test('freshness summary: canon named once when the enforcer IS canon', () => {
  const out = renderFreshnessSummary({ ...summaryInput, canonRepo: 'o/enforcer' });
  assert.match(out, /\*\*Not measured:\*\* `o\/enforcer` — the enforcer/);
  assert.equal(out.match(/— canon, with no vendored mount/g), null);
});

test('freshness summary: empty states say none rather than vanishing', () => {
  const out = renderFreshnessSummary({ ...summaryInput, fresh: [], unhealthy: [] });
  assert.match(out, /\*\*Fresh:\*\* none/);
  assert.match(out, /\*\*Every covered member is up to date 🎉\*\*/);
});

// --- the freshness question answers on the report, not in an issue ---------------
// The dashboard's Drift tile reads each member's declaration against canon, the same
// source this module measures, and recomputes on load — so a per-member issue family
// was a second surface for one question, and a staler one: it is only ever as current
// as the last daily sweep (#1854). What has to survive removing it is the REPORT: drop
// the issues and lose the behind list too, and the sweep can no longer say what it
// found.

test('freshness summary: a behind member is named on the report, with no issue to chase', () => {
  const out = renderFreshnessSummary(summaryInput);
  assert.match(out, /\*\*Behind:\*\*/);
  assert.match(out, /`o\/late` — \*\*behind\*\*: engine v3 → v4/);
  assert.doesNotMatch(out, /drift issue/i, 'the report must not send the reader to an issue that is no longer filed');
  assert.doesNotMatch(out, /Issue actions/, 'freshness files no issues, so it has no issue actions to report');
});

// The prognosis #1851 put in a dormant member's issue body has to land somewhere now
// that there is no body: without it a reader follows the `behind` remedy into a repo
// that is behaving exactly as its own declaration asks.
test('freshness summary: a dormant member behind canon is marked as one that will not self-heal', () => {
  const out = renderFreshnessSummary({
    ...summaryInput,
    unhealthy: [{ fullName: 'o/late', state: 'behind', detail: 'engine v3 → v4', dormant: true }],
  });
  assert.match(out, /`o\/late` — \*\*behind\*\*: engine v3 → v4 — dormant/);
  assert.doesNotMatch(renderFreshnessSummary(summaryInput), /`o\/late`.*dormant/,
    'an awake member carries no such note');
});

test('the freshness module offers no way to file an issue', async () => {
  const mod = await import('../../../tasks/fleet-roster/freshness.mjs');
  for (const name of Object.keys(mod)) {
    assert.doesNotMatch(name, /converge|Issue|LABEL/,
      `freshness answers on the report only, so it exports no issue machinery — found ${name}`);
  }
});
