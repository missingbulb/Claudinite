import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSignalContext } from '../../engine/scheduler/signals/context.mjs';
import { collectSignals } from '../../engine/scheduler/signals/index.mjs';
import { loadConfig } from '../../engine/checks/helpers/repo-context.mjs';
import storeRelease from '../../packs/chrome-extension-release/tasks/store-release/task.mjs';
import dedup from '../../packs/grow_with_claudinite/tasks/growth-dedup/task.mjs';
import logsPrune from '../../packs/grow_with_claudinite/tasks/logs-prune/task.mjs';

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
  } finally { rmSync(root, { recursive: true, force: true }); }
};

// A checkout that exercises all three: a manifest version, a local pack, and a
// pack entry carrying `retention_days`.
const CHECKS_JSON = JSON.stringify({
  packs: ['basics', { id: 'grow_with_claudinite', config: { retention_days: 10 } }],
}, null, 2) + '\n';

const FULL = {
  '.claudinite-checks.json': CHECKS_JSON,
  'manifest.json': JSON.stringify({ manifest_version: 3, name: 'x', version: '1.4.0' }) + '\n',
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
  join(dirname(fileURLToPath(import.meta.url)), '../../engine/scheduler/signals/index.mjs'), 'utf8');

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
    assert.equal(ctx.hasLocalPacks, true);
    assert.equal(ctx.retentionDays, 10);
    // ...alongside the ones that always worked, so this is a whole-shape guard.
    assert.equal(ctx.repo, 'o/r');
    assert.deepEqual(ctx.activePacks, ['basics', 'grow_with_claudinite']);
  });
});

test('buildSignalContext: absent manifest, no local packs, no retention → the honest negatives', () => {
  withRepo({ '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) + '\n' }, (root) => {
    const ctx = ctxFor(root);
    assert.equal(ctx.manifestVersion, null);
    assert.equal(ctx.hasLocalPacks, false); // explicit false, not null — the self-skip depends on it
    assert.equal(ctx.retentionDays, null);
  });
});

test('buildSignalContext: the manifest is found at any of the probed paths, first version wins', () => {
  withRepo({
    '.claudinite-checks.json': JSON.stringify({ packs: [] }) + '\n',
    'src/manifest.json': JSON.stringify({ version: '2.1.0' }) + '\n',
  }, (root) => assert.equal(ctxFor(root).manifestVersion, '2.1.0'));
  // Unparsable or versionless manifests are "nothing to judge", not a crash.
  withRepo({
    '.claudinite-checks.json': JSON.stringify({ packs: [] }) + '\n',
    'manifest.json': '{ not json',
  }, (root) => assert.equal(ctxFor(root).manifestVersion, null));
});

test('buildSignalContext: the pre-rename local_packs root still counts as local packs', () => {
  withRepo({
    '.claudinite-checks.json': JSON.stringify({ packs: [] }) + '\n',
    '.claudinite/local_packs/mine/pack.mjs': 'export default { id: "mine" };\n',
  }, (root) => assert.equal(ctxFor(root).hasLocalPacks, true));
});

// --- the wire end to end: checkout → ctx → collectors → precondition ---------

test('release.manifestVersion reaches store-release, so the manifest-ahead trigger is live', async () => {
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['release', 'commits']);
    assert.equal(signals.release.manifestVersion, '1.4.0');
    // No release yet and NO substantive commit in the window: the only thing that
    // can fire this is the manifest version, which is precisely what was dead.
    assert.equal(signals.commits.substantiveChange, false);
    const v = storeRelease.precondition(signals);
    assert.equal(v.run, true);
    assert.match(v.reason, /manifest 1\.4\.0, no release yet/);
  });
});

test('localPacks.present reaches growth-dedup, so a repo with none self-skips', async () => {
  await withRepo({ '.claudinite-checks.json': CHECKS_JSON }, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['localPacks', 'sharedMount', 'commits']);
    assert.equal(signals.localPacks.present, false);
    const v = dedup.precondition(signals);
    assert.equal(v.run, false);
    assert.match(v.reason, /no local packs/); // not the generic "no relevant movement" arm
  });
  // And a repo that HAS them stays eligible — the gate opens, it does not close.
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['localPacks', 'sharedMount', 'commits']);
    assert.equal(signals.localPacks.present, true);
    assert.doesNotMatch(dedup.precondition(signals).reason, /no local packs/);
  });
});

test('conversationLogs.retentionDays reaches logs-prune, so the age-based prune fires when quiet', async () => {
  await withRepo(FULL, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.present, true);
    assert.equal(signals.conversationLogs.retentionDays, 10);
    assert.equal(signals.conversationLogs.oldestLogAgeDays, 21); // 2026-07-01 → 2026-07-22
    assert.equal(signals.commits.substantiveChange, false); // quiet repo — the regressed case
    const v = logsPrune.precondition(signals);
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
    assert.equal(logsPrune.precondition(signals).run, false);
  });
});

test('conversationLogs: retention unset keeps the prune silent — no default is invented', async () => {
  await withRepo({ '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) + '\n' }, async (root) => {
    const signals = await collectSignals(fakeGh(QUIET), ctxFor(root), ['commits', 'conversationLogs']);
    assert.equal(signals.conversationLogs.retentionDays, null);
    assert.equal(logsPrune.precondition(signals).run, false);
  });
});

