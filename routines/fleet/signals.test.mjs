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

// --- pathAffectsMembers -----------------------------------------------------

test('pathAffectsMembers: member paths yes, orchestration/artifacts no', () => {
  for (const p of ['packs/tidy-repo/pack.mjs', 'checks/run.mjs', 'skills/x/SKILL.md', 'migrations/m.mjs', 'bootstrap.md', 'mount/sync-claudinite.sh', 'mount/session-start.sh']) {
    assert.equal(pathAffectsMembers(p), true, p);
  }
  for (const p of ['routines/fleet/gates.mjs', 'routines/auto-all-repos-maintenance.md', 'routines/fleet/plan.json', 'README.md', 'CLAUDE.md']) {
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
  const on = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: bucket, canonChanged: false });
  const off = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (bucket + 1) % 7, canonChanged: false });
  assert.equal(on.fullSweep, true);
  assert.equal(off.fullSweep, false);
});

test('buildSignals: idle repo (old push, not full sweep) skips the main-moved probe', async () => {
  const gh = fakeGh([okPacks, [/\/pulls\?/, { status: 200, json: [] }], [/\/issues\?/, { status: 200, json: [] }]]);
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: false });
  assert.equal(s.mainMoved, false);
  assert.equal(s.projectChanged, false);
  assert.equal(s.substantiveChange, false);
  assert.equal(s.branchesTouched.length, 0, 'no branch probe when idle');
  assert.ok(!gh.calls.some((p) => /\/commits\?sha=/.test(p)), 'main-moved probe skipped');
  assert.deepEqual(s.activePacks, ['basics', 'tidy-repo']);
});

test('buildSignals: pushed-in-window with commits → mainMoved/projectChanged true', async () => {
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [{ name: 'main' }, { name: 'feat' }] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: true });
  assert.equal(s.mainMoved, true);
  assert.equal(s.projectChanged, true);
  assert.equal(s.substantiveChange, true, 'a plain (non-bot, non-housekeeping) commit is substantive');
  assert.deepEqual(s.branchesTouched, ['main', 'feat']);
  assert.equal(s.canonChanged, true);
});

test('buildSignals: substantiveChange excludes bot / [skip ci] / baselining commits', async () => {
  const housekeeping = [
    { sha: 'a', author: { login: 'github-actions[bot]' }, commit: { message: 'Refresh data (daily top-up)' } },
    { sha: 'b', author: { login: 'missingbulb' }, commit: { message: 'Bump version to 1.2.3 [skip ci]' } },
    { sha: 'c', author: { login: 'missingbulb' }, commit: { message: 'Claudinite baselining: seed default-on packs' } },
  ];
  const routes = (commits) => [
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: commits }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ];
  const opts = { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: false };

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
  const s = await buildSignals(gh, REPO({ pushed_at: '2026-07-01T00:00:00Z' }), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: false });
  assert.deepEqual(s.prsTouched, [3, 2]);
});

test('buildSignals: widening (mainMoved) collects all open PRs regardless of updated_at', async () => {
  const prs = [
    { number: 3, updated_at: '2026-07-11T10:00:00Z' },
    { number: 1, updated_at: '2026-01-01T00:00:00Z' }, // stale but included when widening
  ];
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }], // mainMoved -> widen
    [/\/pulls\?/, { status: 200, json: prs }],
    [/\/issues\?/, { status: 200, json: [] }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: false });
  assert.deepEqual(s.prsTouched, [3, 1]);
});

test('buildSignals: the issues probe filters out PRs', async () => {
  const items = [
    { number: 9, updated_at: '2026-07-11T10:00:00Z' },
    { number: 8, updated_at: '2026-07-11T09:00:00Z', pull_request: {} }, // a PR in the issues feed
  ];
  const gh = fakeGh([
    okPacks,
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'x' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: items }],
    [/\/branches\?/, { status: 200, json: [] }],
  ]);
  const s = await buildSignals(gh, REPO(), { sinceIso: SINCE, weekdayUtc: (fullSweepBucket('owner/foo') + 1) % 7, canonChanged: false });
  assert.deepEqual(s.issuesTouched, [9]);
});
