import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSignalContext } from '../signals/context.mjs';
import { collectSignals } from '../signals/index.mjs';
import { loadConfig } from '../../../engine/checks/helpers/repo-context.mjs';
import storeReleaseJson from '../../chrome-extension/tasks/store-release/task.json' with { type: 'json' };
import dedupJson from '../../claudinite-growth/tasks/growth-dedup/task.json' with { type: 'json' };
import logsPruneJson from '../../claudinite-growth/tasks/logs-prune/task.json' with { type: 'json' };
import proseToChecksJson from '../../claudinite-growth/tasks/prose-to-checks-sweep/task.json' with { type: 'json' };
import revalidationJson from '../../claudinite-growth/tasks/rule-revalidation/task.json' with { type: 'json' };
import { removeTree } from '../../../engine/remove-tree.mjs';
import { evaluatePrecondition, loadTaskTerms } from '../shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const storeRelease = normalizeTaskDeclaration(storeReleaseJson);
const dedup = normalizeTaskDeclaration(dedupJson);
const logsPrune = normalizeTaskDeclaration(logsPruneJson);
const proseToChecks = normalizeTaskDeclaration(proseToChecksJson);
const revalidation = normalizeTaskDeclaration(revalidationJson);

const PACKS = join(dirname(fileURLToPath(import.meta.url)), '../..');
// The task's cadence term reads its run history and the repo's schedule, which are
// not what these cases are about: an empty history at the tick's own instant lets
// every cadence hold, so what decides is the signal under test.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const verdictFor = async (decl, dir, signals) =>
  evaluatePrecondition({ decl, terms: await loadTaskTerms(join(PACKS, dir)) }, { runs: { list: [] }, ...signals }, {}, null, '2026-07-22T00:00:00Z', SCHEDULE);

// The collectors take an injected `ctx` — which makes them unit-testable with no
// repo, and also makes it possible for a key NOTHING EVER SETS to look healthy
// forever (a hand-built `{ present: true }` proves the collector, not the wire).
// So every assertion here goes through the REAL construction: a checkout on
// disk → loadConfig → buildSignalContext → collectSignals → the actual
// precondition. Nothing hand-builds a ctx or a signals object.

const withRepo = (files, fn) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-signal-ctx-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return fn(root);
  } finally { removeTree(root); }
};

// A checkout that exercises all three: a manifest version, a local pack, and a
// pack entry carrying `retention_days`.
const CHECKS_JSON = JSON.stringify({
  packs: ['basics', { id: 'claudinite-growth', config: { retention_days: 10 } }],
}, null, 2) + '\n';

const FULL = {
  '.claudinite-settings.json': CHECKS_JSON,
  'manifest.json': JSON.stringify({ manifest_version: 3, name: 'x', version: '1.4.0' }) + '\n',
  // The release orchestrator, by its contract name: store-release declines outright
  // on a repo that does not publish (#1057), so without this the manifest-ahead
  // trigger below could never be reached.
  '.github/workflows/chrome-extension-release.yml': 'name: Release to Chrome Store\non:\n  push:\n',
  '.claudinite/local/packs/mine/pack.mjs': 'export default { id: "mine" };\n',
};

const ctxFor = (root) => buildSignalContext({
  root,
  repo: 'o/r',
  defaultBranch: 'main',
  now: '2026-07-22T00:00:00Z',
  sinceIso: '2026-07-21T00:00:00Z',
  config: loadConfig(root),
  packConfigFor: (id) => loadConfig(root).packConfig?.[id] ?? {},
});

// A fake gh keyed by regex → response (the collectors' established test seam).
const fakeGh = (routes) => async (path) => {
  for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
  return { status: 404, json: null };
};
// A logs branch carrying one log, at whatever capture stamp the case needs (the
// collector ages a log by its filename stamp, as the prune itself does).
const logsBranch = (...stamps) => [
  [/\/branches\/conversation-logs/, { status: 200, json: { name: 'conversation-logs' } }],
  [/\/git\/trees\/conversation-logs/, { status: 200, json: {
    tree: [{ path: 'README.md' }, ...stamps.map((s, i) => ({ path: `${s}--issue-${i + 1}--sess-${i}.jsonl` }))],
  } }],
];
// now is 2026-07-22 and retention is 10d, so this log (21d old) is prunable.
const QUIET = [
  [/\/commits\?sha=/, { status: 200, json: [] }],
  [/\/releases\/latest/, { status: 404, json: null }],
  ...logsBranch('2026-07-01T0000Z'),
];

// The class-of-bug guard. Three collectors read `ctx` keys nothing ever set, and
// each one had a green unit test that hand-built the shape the collector could
// not emit — so the tests proved the collector and never the wire. This closes
// that for good: EVERY `ctx.<key>` the collectors read must be a key the real
// construction produces. Add a ctx read tomorrow without wiring it and this
// fails, before it can reach a precondition as a permanent null.
const COLLECTORS_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../signals/index.mjs'), 'utf8');

// The two reads that legitimately are NOT built by buildSignalContext, each with
// the reason it is exempt — an unexplained addition here is the smell.
const NOT_FROM_CONSTRUCTION = {
  commits: 'derived inside collectSignals itself — the one shared window read the commit-derived collectors reuse',
  canonHead: 'deliberately absent: the scheduler Action no longer reads canon, so baselining falls back to stamp age (DESIGN §3.3 / basics/tasks/baselining)',
};

test('every ctx key the collectors read is populated by the real construction', () => {
  const read = [...new Set([...COLLECTORS_SRC.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
  assert.ok(read.length >= 8, `expected to find the ctx reads by source scan, found ${read.length}`);

  withRepo(FULL, (root) => {
    const built = new Set(Object.keys(ctxFor(root)));
    const unwired = read.filter((k) => !built.has(k) && !(k in NOT_FROM_CONSTRUCTION));
    assert.deepEqual(unwired, [],
      `signals/index.mjs reads ctx.${unwired.join(', ctx.')} but buildSignalContext never sets it — `
      + 'a precondition reading it gets a permanent null. Populate it in signals/context.mjs, or document the exemption.');
  });
});

test('buildSignalContext populates every ctx key the collectors read', () => {
  withRepo(FULL, (root) => {
    const ctx = ctxFor(root);
    // The three that were read but never set — a collector cannot invent them.
    assert.equal(ctx.manifestVersion, '1.4.0');
    assert.equal(ctx.shipsReleasePipeline, true);
    assert.equal(ctx.retentionDays, 10);
    // ...alongside the ones that always worked, so this is a whole-shape guard.
    assert.equal(ctx.repo, 'o/r');
    assert.deepEqual(ctx.activePacks, ['basics', 'claudinite-growth']);
  });
});

test('buildSignalContext: absent manifest, no retention → the honest negatives', () => {
  withRepo({ '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) + '\n' }, (root) => {
    const ctx = ctxFor(root);
    assert.equal(ctx.manifestVersion, null);
    assert.equal(ctx.shipsReleasePipeline, false); // explicit false — the task's gate reads it
    assert.equal(ctx.retentionDays, null);
  });
});

test('buildSignalContext: the manifest is found at any of the probed paths, first version wins', () => {
  withRepo({
    '.claudinite-settings.json': JSON.stringify({ packs: [] }) + '\n',
    'src/manifest.json': JSON.stringify({ version: '2.1.0' }) + '\n',
  }, (root) => assert.equal(ctxFor(root).manifestVersion, '2.1.0'));
  // Unparsable or versionless manifests are "nothing to judge", not a crash.
  withRepo({
    '.claudinite-settings.json': JSON.stringify({ packs: [] }) + '\n',
    'manifest.json': '{ not json',
  }, (root) => assert.equal(ctxFor(root).manifestVersion, null));
});



// --- the wire end to end: checkout → ctx → collectors → precondition ---------

test('release.manifestVersion reaches store-release, so the manifest-ahead trigger is live', async () => {
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['release', 'commits']);
    assert.equal(signals.release.manifestVersion, '1.4.0');
    // No release yet and NO substantive commit in the window: the only thing that
    // can fire this is the manifest version, which is precisely what was dead.
    assert.equal(signals.commits.substantiveChange, false);
    const v = await verdictFor(storeRelease, 'chrome-extension/tasks/store-release', signals);
    assert.equal(v.run, true);
    assert.match(v.reason, /manifest 1\.4\.0, and nothing released yet/);
  });
});

// A commit under the local root is local-pack movement. Whether the repo HAS
// local packs is not asked at all: adoption seeds them and the nightly never
// removes them.
test('a local-pack commit reaches growth-dedup', async () => {
  for (const path of ['.claudinite/local/packs/mine/RULES.md']) {
    await withRepo(FULL, async (root) => {
      const gh = fakeGh([
        [/\/commits\/c1$/, { status: 200, json: { files: [{ filename: path }] } }],
        [/\/commits\?sha=/, { status: 200, json: [{ sha: 'c1' }] }],
        ...QUIET,
      ]);
      const signals = await collectSignals(gh, ctxFor(root), ['sharedMount', 'commits']);
      assert.ok(signals.commits.touchedPaths.includes(path), path);
      assert.equal((await verdictFor(dedup, 'claudinite-growth/tasks/growth-dedup', signals)).run, true, path);
    });
  }
  // …and a window that moved nothing local, with no canon movement either, declines.
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['sharedMount', 'commits']);
    assert.deepEqual(signals.commits.touchedPaths, []);
    assert.equal((await verdictFor(dedup, 'claudinite-growth/tasks/growth-dedup', signals)).run, false);
  });
});

test('conversationLogs.retentionDays reaches logs-prune, so the age-based prune fires when quiet', async () => {
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.present, true);
    assert.equal(signals.conversationLogs.retentionDays, 10);
    assert.equal(signals.conversationLogs.oldestLogAgeDays, 21); // 2026-07-01 → 2026-07-22
    assert.equal(signals.commits.substantiveChange, false); // quiet repo — the regressed case
    const v = await verdictFor(logsPrune, 'claudinite-growth/tasks/logs-prune', signals);
    assert.equal(v.run, true);
    assert.match(v.reason, /retention 10d/);
  });
});

// The other half of the same wire: an age the collector can actually emit, which
// is BELOW retention, must keep the quiet repo silent. Without this the "fires
// when quiet" test above is satisfied by a collector that always says yes.
test('conversationLogs.oldestLogAgeDays reaches logs-prune, so young logs keep it silent', async () => {
  await withRepo(FULL, async (root) => {
    const routes = [
      [/\/commits\?sha=/, { status: 200, json: [] }],
      ...logsBranch('2026-07-21T0000Z'), // 1 day old, retention is 10
    ];
    const signals = await collectSignals(fakeGh(routes), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.oldestLogAgeDays, 1);
    assert.equal((await verdictFor(logsPrune, 'claudinite-growth/tasks/logs-prune', signals)).run, false);
  });
});

// The layering, both halves in one test. The SIGNAL still invents no default — it is
// keyed by the parameter rather than by the pack, so it cannot know a growth-pack
// policy and reports `null` for "nothing declared it". The TASK is what turns that
// into 10 days (#1620), which is why the verdict runs here where it used to be silent.
test('conversationLogs: the signal invents no retention default — the task supplies it', async () => {
  await withRepo({ '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) + '\n' }, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.retentionDays, null, 'the signal reports what the declaration said, and it said nothing');
    const v = await verdictFor(logsPrune, 'claudinite-growth/tasks/logs-prune', signals);
    assert.equal(v.run, true, 'and the undeclared repo prunes on the default rather than leaking forever');
    assert.match(v.reason, /retention 10d/);
  });
});

// The opt-out, on the same wire: absence no longer expresses capture-only, so a repo
// that wants it has to declare it — and that declaration must reach the precondition
// and stop the item being filed at all.
test('conversationLogs: a declared non-positive retention is the capture-only opt-out', async () => {
  const settings = JSON.stringify({ packs: [{ id: 'claudinite-growth', config: { retention_days: 0 } }] }) + '\n';
  await withRepo({ '.claudinite-settings.json': settings }, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.retentionDays, 0);
    const v = await verdictFor(logsPrune, 'claudinite-growth/tasks/logs-prune', signals);
    assert.equal(v.run, false);
    assert.match(v.reason, /capture-only/);
  });
});

