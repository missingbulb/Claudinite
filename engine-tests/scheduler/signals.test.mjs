import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSignals, SIGNAL_COLLECTORS } from '../../engine/scheduler/signals/index.mjs';
import { lastSuccessTime } from '../../engine/scheduler/signals/gh.mjs';
import { windowStart } from '../../engine/scheduler/run.mjs';

// A fake gh keyed by regex → response (matches the fleet planner's test seam).
const fakeGh = (routes) => async (path) => {
  for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
  return { status: 404, json: null };
};
const ctx = (over = {}) => ({ repo: 'o/r', defaultBranch: 'main', sinceIso: '2026-07-21T00:00:00Z', now: '2026-07-22T00:00:00Z', ...over });

test('the collector set is the DESIGN §3.3 vocabulary', () => {
  assert.deepEqual(SIGNAL_COLLECTORS.sort(), [
    'branches', 'commits', 'conversationLogs', 'fleet', 'issues',
    'localPacks', 'prs', 'release', 'sharedMount', 'stamp',
  ].sort());
});

test('collectSignals gathers only the requested names', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'a', commit: { message: 'real work' }, author: { login: 'dev' } }] }],
    [/\/commits\/a$/, { status: 200, json: { files: [{ filename: 'src/x.js' }] } }],
    [/\/branches\?/, { status: 200, json: [{ name: 'main' }, { name: 'feature' }] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['commits', 'branches']);
  assert.deepEqual(Object.keys(out).sort(), ['branches', 'commits']);
  assert.equal(out.commits.substantiveChange, true);
  assert.deepEqual(out.commits.touchedPaths, ['src/x.js']);
  assert.deepEqual(out.branches.names, ['main', 'feature']);
});

test('commits: bot and housekeeping commits are not substantive', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [
      { sha: 'b', commit: { message: 'Baselining: refresh mount' }, author: { login: 'dev' } },
      { sha: 'c', commit: { message: 'bump dep' }, author: { login: 'dependabot[bot]' } },
      { sha: 'd', commit: { message: '[claudinite-task] gcec/x' }, author: { login: 'dev' } },
    ] }],
    [/\/commits\/[bcd]$/, { status: 200, json: { files: [] } }],
  ]);
  const out = await collectSignals(gh, ctx(), ['commits']);
  assert.equal(out.commits.count, 3);
  assert.equal(out.commits.substantiveChange, false); // all three are housekeeping/bot/self
});

test('issues: dispatch issues and trackers are invisible; touched respects the window', async () => {
  const gh = fakeGh([
    [/\/issues\?state=open/, { status: 200, json: [
      { number: 1, title: 'real feature request', updated_at: '2026-07-21T12:00:00Z', labels: [] },
      { number: 2, title: '[claudinite-task] p/t d2026-07-21', updated_at: '2026-07-21T12:00:00Z' },
      { number: 3, title: 'Claudinite tracker: Repo Tidy', updated_at: '2026-07-21T12:00:00Z' },
      { number: 4, title: 'old issue', updated_at: '2026-07-01T00:00:00Z', labels: [] },
      { number: 5, title: 'a PR', updated_at: '2026-07-21T12:00:00Z', pull_request: {} },
    ] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['issues']);
  assert.deepEqual(out.issues.open.map((i) => i.number), [1, 4]);
  assert.deepEqual(out.issues.touched, [1]); // #4 is outside the window
});

test('release: a 404 latest release means no release yet', async () => {
  const gh = fakeGh([[/\/releases\/latest/, { status: 404, json: null }]]);
  const out = await collectSignals(gh, ctx({ manifestVersion: '1.2.0' }), ['release']);
  assert.deepEqual(out.release, { latestTag: null, manifestVersion: '1.2.0' });
});

test('sharedMount: only DECLARED packs whose vendored files changed are reported', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [{ sha: 'a', commit: { message: 'Baseline' }, author: { login: 'x' } }] }],
    [/\/commits\/a$/, { status: 200, json: { files: [
      { filename: '.claudinite/shared/packs/basics/RULES.md' },
      { filename: '.claudinite/shared/packs/product-wiki/x.mjs' },
    ] } }],
  ]);
  const out = await collectSignals(gh, ctx({ activePacks: ['basics'] }), ['sharedMount']);
  assert.deepEqual(out.sharedMount.changedPacks, ['basics']); // product-wiki not declared → ignored
});

test('stamp: age is derived from the mount stamp and now', async () => {
  const gh = fakeGh([]);
  const out = await collectSignals(gh, ctx({ config: { claudinite: { updated: '2026-07-20T00:00:00Z', ref: 'abc' } }, now: '2026-07-22T00:00:00Z' }), ['stamp']);
  assert.equal(out.stamp.ref, 'abc');
  assert.equal(out.stamp.ageDays, 2);
});

test('a collector that throws is isolated under its key', async () => {
  const gh = fakeGh([[/\/branches\?/, () => { throw new Error('boom'); }]]);
  const out = await collectSignals(gh, ctx(), ['branches']);
  assert.match(out.branches.error, /boom/);
});

test('lastSuccessTime reads the newest successful run from the ledger', async () => {
  const gh = fakeGh([[/actions\/workflows\/.*\/runs\?status=success/, { status: 200, json: { workflow_runs: [{ run_started_at: '2026-07-21T10:00:00Z' }] } }]]);
  assert.equal(await lastSuccessTime(gh, 'o/r'), '2026-07-21T10:00:00Z');
  const none = fakeGh([[/runs\?status=success/, { status: 200, json: { workflow_runs: [] } }]]);
  assert.equal(await lastSuccessTime(none, 'o/r'), null);
});

test('windowStart uses the widest due frequency plus an hour of slack', () => {
  const due = [{ task: { decl: { frequency: 'daily' } } }, { task: { decl: { frequency: 'weekly' } } }];
  // weekly (7d) + 1h back from 2026-07-22T00:00Z
  assert.equal(windowStart(due, '2026-07-22T00:00:00Z'), '2026-07-14T23:00:00.000Z');
  assert.equal(windowStart([], '2026-07-22T00:00:00Z'), '2026-07-21T23:00:00.000Z'); // no tasks → 1h
});
