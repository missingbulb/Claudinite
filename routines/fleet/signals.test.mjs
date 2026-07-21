import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignals, computeCanonChanged, pathAffectsMembers } from './signals.mjs';
import { fullSweepBucket } from './schedule.mjs';

// A configurable fake gh: routes are [regex, responder]; the first match wins.
// Records every path it was asked for so tests can assert a probe was skipped.
function fakeGh(routes) {
  const calls = [];
  const gh = async (path) => {
    calls.push(path);
    for (const [re, resp] of routes) {
      if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
    }
    return { status: 404, json: null };
  };
  gh.calls = calls;
  return gh;
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const SINCE = '2026-07-11T00:00:00Z';
// The canonChange object buildSignals now takes ({ changed, packs, crossCutting }).
const NO_CANON = { changed: false, packs: new Set(), crossCutting: false };

// --- pathAffectsMembers -----------------------------------------------------

test('pathAffectsMembers: member paths yes, orchestration/artifacts no', () => {
  for (const p of ['packs/tidy-repo/pack.mjs', 'engine/checks/check_the_world.mjs', 'migrations/m.mjs', 'bootstrap.md', 'engine/hooks/session-start-command.sh']) {
    assert.equal(pathAffectsMembers(p), true, p);
  }
  // The pre-#385 legacy roots (checks/, skills/, mount/, the root sync hook)
  // retired with phase 3 — they no longer classify as member-affecting.
  for (const p of ['routines/fleet/gates.mjs', 'routines/auto-all-repos-maintenance.md', 'routines/fleet/plan.json', 'README.md', 'CLAUDE.md', 'skills/x/SKILL.md', 'mount/x.sh', 'checks/x.mjs', 'sync-claudinite.sh']) {
    assert.equal(pathAffectsMembers(p), false, p);
  }
});

// --- computeCanonChanged ----------------------------------------------------

test('computeCanonChanged: true when a commit touches a member path, false otherwise', async () => {
  const commits = [{ sha: 'a' }, { sha: 'b' }];
  const touchingPacks = fakeGh([
    [/\/commits\?since=/, { status: 200, json: commits }],
    [/\/commits\/a$/, { status: 200, json: { files: [{ filename: 'routines/fleet/gates.mjs' }] } }],
    [/\/commits\/b$/, { status: 200, json: { files: [{ filename: 'packs/basics/RULES.md' }] } }],
  ]);
  assert.equal(await computeCanonChanged(touchingPacks, 'o/home', SINCE), true);

  const orchestrationOnly = fakeGh([
    [/\/commits\?since=/, { status: 200, json: [{ sha: 'a' }] }],
    [/\/commits\/a$/, { status: 200, json: { files: [{ filename: 'routines/fleet/DESIGN.md' }] } }],
  ]);
  assert.equal(await computeCanonChanged(orchestrationOnly, 'o/home', SINCE), false);

  const noCommits = fakeGh([[/\/commits\?since=/, { status: 200, json: [] }]]);
  assert.equal(await computeCanonChanged(noCommits, 'o/home', SINCE), false);
});

// --- buildSignals -----------------------------------------------------------

const REPO = (over = {}) => ({ full_name: 'owner/foo', default_branch: 'main', pushed_at: '2026-07-11T12:00:00Z', ...over });
const okPacks = [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'tidy-repo'] }) } }];

test('buildSignals: fullSweep is set by the repo weekday bucket', async () => {
  const bucket = fullSweepBucket('owner/foo');
  const gh = fakeGh([okPacks, [/./, { status: 200, json: [] }]]);
  const on = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: bucket, canonChange: NO_CANON });
  const off = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (bucket + 1) % 7, canonChange: NO_CANON });
  assert.equal(on.fullSweep, true);
  assert.equal(off.fullSweep, false);
});

test('buildSignals: idle repo (old push, not full sweep) skips the main-moved probe', async () => {
  const gh = fakeGh([okPacks, [/\/pulls\?/, { status: 200, json: [] }], [/\/issues\?/, { status: 200, json: [] }]]);
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.equal(s.mainMoved, false);
  assert.equal(s.projectChanged, false);
  assert.equal(s.substantiveChange, false);
  assert.equal(s.branchesTouched.length, 0, 'no branch probe when idle');
  assert.ok(!gh.calls.some((p) => /\/commits\?sha=/.test(p)), 'main-moved probe skipped');
  assert.deepEqual(s.activePacks, ['basics', 'tidy-repo']);
});

test('buildSignals: a namespaced local-pack declaration normalizes to the bare id in activePacks', async () => {
  // local_packs/proj (string or entry-object form) must land bare, so the gates
  // that compare against canon pack ids — and packConfigs lookups — keep matching.
  const namespacedPacks = [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({
    packs: ['basics', 'local_packs/proj', { id: 'local_packs/other', config: { knob: 1 } }],
  }) } }];
  const gh = fakeGh([namespacedPacks, [/\/pulls\?/, { status: 200, json: [] }], [/\/issues\?/, { status: 200, json: [] }]]);
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.deepEqual(s.activePacks, ['basics', 'proj', 'other']);
  assert.deepEqual(s.packConfigs, { other: { knob: 1 } });
});

test('buildSignals: pushed-in-window with commits → mainMoved/projectChanged true', async () => {
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [{ name: 'main' }, { name: 'feat' }] }],
  ]);
  const canonChange = { changed: true, packs: new Set(['basics']), crossCutting: false };
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange });
  assert.equal(s.mainMoved, true);
  assert.equal(s.projectChanged, true);
  assert.equal(s.substantiveChange, true, 'a plain (non-bot, non-housekeeping) commit is substantive');
  assert.deepEqual(s.branchesTouched, ['main', 'feat']);
  assert.equal(s.canonChanged, true);
  assert.equal(s.relevantCanonChanged, true, 'the repo declares basics, whose files moved');
});

test('buildSignals: substantiveChange excludes bot / [skip ci] / baselining commits', async () => {
  const housekeeping = [
    { sha: 'a', author: { login: 'github-actions[bot]' }, commit: { message: 'Refresh data (daily top-up)' } },
    { sha: 'b', author: { login: 'missingbulb' }, commit: { message: 'Bump version to 1.2.3 [skip ci]' } },
    { sha: 'c', author: { login: 'missingbulb' }, commit: { message: 'Claudinite baselining: seed default-on packs' } },
    { sha: 'e', author: { login: 'missingbulb' }, commit: { message: 'Baseline: refresh Claudinite mount + gitignore + CLAUDE.md self-check' } },
    // The fleet now lands its own maintenance and growth via auto-merged PRs — their
    // squash-merge subjects must read as housekeeping too, else last night's merge
    // fires tonight's growth-extract/dedup/tidy on a repo with no new work.
    { sha: 'f', author: { login: 'missingbulb' }, commit: { message: 'Claudinite maintenance (#12)' } },
    { sha: 'g', author: { login: 'missingbulb' }, commit: { message: 'Claudinite growth: extract lessons (#34)' } },
  ];
  const routes = (commits) => [
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: commits }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ];
  const opts = { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON };

  const s1 = await buildSignals(fakeGh(routes(housekeeping)), REPO(), opts);
  assert.equal(s1.mainMoved, true, 'main still moved');
  assert.equal(s1.projectChanged, true, 'projectChanged tracks any move (tidy keys on it)');
  assert.equal(s1.substantiveChange, false, 'all-housekeeping window is not substantive');

  // one genuine human, non-housekeeping commit among the housekeeping → substantive
  const mixed = [...housekeeping, { sha: 'd', author: { login: 'missingbulb' }, commit: { message: 'fix: correct the reach-radius math' } }];
  const s2 = await buildSignals(fakeGh(routes(mixed)), REPO(), opts);
  assert.equal(s2.substantiveChange, true, 'a real commit among housekeeping → substantive');
});

test('buildSignals: without widening, only in-window PRs are collected (sorted, early stop)', async () => {
  const prs = [
    { number: 3, updated_at: '2026-07-11T10:00:00Z' }, // in window
    { number: 2, updated_at: '2026-07-11T01:00:00Z' }, // in window
    { number: 1, updated_at: '2026-07-01T00:00:00Z' }, // older → stop
  ];
  // old push + not full sweep => no widening
  const gh = fakeGh([okPacks, [/\/pulls\?/, { status: 200, json: prs }], [/\/issues\?/, { status: 200, json: [] }]]);
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.deepEqual(s.prsTouched, [3, 2]);
});

test('buildSignals: widening (substantive change) collects all open PRs regardless of updated_at', async () => {
  const prs = [
    { number: 3, updated_at: '2026-07-11T10:00:00Z' },
    { number: 1, updated_at: '2026-01-01T00:00:00Z' }, // stale but included when widening
  ];
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }], // substantive commit -> widen
    [/\/pulls\?/, { status: 200, json: prs }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.deepEqual(s.prsTouched, [3, 1]);
});

test('buildSignals: the issues probe filters out PRs and the routine\'s own trackers', async () => {
  const items = [
    { number: 9, updated_at: '2026-07-11T10:00:00Z', title: 'a real bug' },
    { number: 8, updated_at: '2026-07-11T09:30:00Z', pull_request: {}, title: 'a PR' }, // a PR in the issues feed
    { number: 7, updated_at: '2026-07-11T09:00:00Z', title: 'Claudinite tracker: Repo Tidy' }, // the routine's own tracker
    { number: 6, updated_at: '2026-07-11T08:00:00Z', title: 'Auto-Improvements Tracker - Growth: Extract' }, // legacy tracker name
  ];
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: items }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.deepEqual(s.issuesTouched, [9], 'only the genuine issue — PR and both trackers excluded');
});

test('buildSignals: a repo whose only in-window issue is its tidy tracker reports no issue activity', async () => {
  // Non-widened (old push, not full sweep): the sorted feed has the tracker in window,
  // then older issues. The tracker is dropped, so repo-tidy sees no issue activity and
  // won't re-fire on this otherwise-quiet repo.
  const items = [
    { number: 3, updated_at: '2026-07-11T10:00:00Z', title: 'Claudinite tracker: Repo Tidy' }, // in window, but a tracker
    { number: 2, updated_at: '2026-07-01T00:00:00Z', title: 'old issue' }, // older → stop
  ];
  const gh = fakeGh([okPacks, [/\/pulls\?/, { status: 200, json: [] }], [/\/issues\?/, { status: 200, json: items }]]);
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.deepEqual(s.issuesTouched, []);
});

test('buildSignals: hasLocalPacks reflects a tracked .claudinite/local_packs/ subdir', async () => {
  const withPacks = fakeGh([okPacks, [/\/local_packs$/, { status: 200, json: [{ name: 'gcec', type: 'dir' }] }], [/./, { status: 200, json: [] }]]);
  const without = fakeGh([okPacks, [/\/local_packs$/, { status: 404, json: null }], [/./, { status: 200, json: [] }]]);
  const opts = { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON };
  assert.equal((await buildSignals(withPacks, REPO(), opts)).hasLocalPacks, true);
  assert.equal((await buildSignals(without, REPO(), opts)).hasLocalPacks, false);
});

test('buildSignals: localPacksChanged is true iff a window commit touched .claudinite/local_packs/', async () => {
  const base = (files) => fakeGh([
    okPacks,
    [/\/local_packs$/, { status: 200, json: [{ name: 'gcec', type: 'dir' }] }],
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/commits\/x$/, { status: 200, json: { files } }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const opts = { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON };
  const changed = await buildSignals(base([{ filename: '.claudinite/local_packs/gcec/RULES.md' }, { filename: 'src/app.js' }]), REPO(), opts);
  assert.equal(changed.localPacksChanged, true);
  const codeOnly = await buildSignals(base([{ filename: 'src/app.js' }]), REPO(), opts);
  assert.equal(codeOnly.localPacksChanged, false, 'a code-only change does not count');
});

test('buildSignals: localPacksChanged stays false and skips the per-commit reads when there are no local packs', async () => {
  const gh = fakeGh([
    okPacks,
    [/\/local_packs$/, { status: 404, json: null }],
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.equal(s.hasLocalPacks, false);
  assert.equal(s.localPacksChanged, false);
  assert.ok(!gh.calls.some((p) => /\/commits\/x$/.test(p)), 'no per-commit file read when the repo has no local packs');
});

test('buildSignals: relevantCanonChanged fires only for a declared pack or a cross-cutting change', async () => {
  const opts = (canonChange) => ({ sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange });
  const gh = fakeGh([okPacks, [/./, { status: 200, json: [] }]]); // repo declares basics + tidy-repo
  // a pack the repo declares moved → relevant
  assert.equal((await buildSignals(gh, REPO(), opts({ changed: true, packs: new Set(['tidy-repo']), crossCutting: false }))).relevantCanonChanged, true);
  // a pack the repo does NOT declare moved → not relevant (coarse canonChanged still true)
  const s = await buildSignals(gh, REPO(), opts({ changed: true, packs: new Set(['flutter']), crossCutting: false }));
  assert.equal(s.canonChanged, true);
  assert.equal(s.relevantCanonChanged, false);
  // a cross-cutting change (checks/skills/mount) is relevant to every member
  assert.equal((await buildSignals(gh, REPO(), opts({ changed: true, packs: new Set(), crossCutting: true }))).relevantCanonChanged, true);
});

test('buildSignals: a housekeeping-only main move does not widen (repo-tidy stays quiet)', async () => {
  // main moved, but only a baseline commit — substantiveChange false, so no widening:
  // branches are not fetched and only in-window PRs/issues are collected.
  const prs = [
    { number: 5, updated_at: '2026-07-11T10:00:00Z' }, // in window
    { number: 4, updated_at: '2026-01-01T00:00:00Z' }, // stale → excluded (no widen)
  ];
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'b', author: { login: 'missingbulb' }, commit: { message: 'Baseline: refresh Claudinite mount' } }] }],
    [/\/pulls\?/, { status: 200, json: prs }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [{ name: 'main' }, { name: 'feat' }] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChange: NO_CANON });
  assert.equal(s.mainMoved, true, 'main did move');
  assert.equal(s.substantiveChange, false, 'but only housekeeping');
  assert.deepEqual(s.branchesTouched, [], 'no branch probe without a substantive move');
  assert.deepEqual(s.prsTouched, [5], 'only the in-window PR, not the stale one');
  assert.ok(!gh.calls.some((p) => /\/branches\?/.test(p)), 'branch probe skipped entirely');
});
