import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo, cleanup, git, gitDated, writeFiles } from './helpers.mjs';
import { buildContext, loadConfig, CONFIG_KEYS, isDormant } from '../engine/checks/helpers/repo-context.mjs';
import { removeTree } from '../engine/remove-tree.mjs';

test('loadConfig: clean settings validate with no errors; a missing file is empty and error-free', () => {
  const ok = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], rules: {}, maintenance: { delivery: 'auto' } }) } });
  const none = makeRepo({ changed: {} });
  try {
    assert.deepEqual(loadConfig(ok).errors, []);
    assert.deepEqual(loadConfig(ok).packs, ['basics']);
    assert.deepEqual(loadConfig(none).errors, []);
  } finally { cleanup(ok); cleanup(none); }
});

test('loadConfig: an unknown top-level property is reported, valid keys still parse', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], nonsense: 1 }) } });
  try {
    const cfg = loadConfig(root);
    assert.equal(cfg.errors.length, 1);
    assert.match(cfg.errors[0].what, /unknown setting "nonsense"/);
    assert.deepEqual(cfg.packs, ['basics']); // the good keys still load
  } finally { cleanup(root); }
});

test('loadConfig: a pack entry object normalizes — id into packs, config into the packConfig view, accept with provenance', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [
      'basics',
      { id: 'product-wiki',
        config: { rules: [{ from: 'a', to: 'b' }] },
        rules: { 'file-placement': 'advisory' },
        accept: [{ rule: 'reference-integrity', path: 'x.md', reason: 'why' }] },
      { id: 'executable-requirements', via: ['spec-driven-product'] },
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, []);
    assert.deepEqual(cfg.packs, ['basics', 'product-wiki', 'executable-requirements']);
    assert.deepEqual(cfg.packConfig, { 'product-wiki': { rules: [{ from: 'a', to: 'b' }] } });
    assert.deepEqual(cfg.rules, { 'file-placement': 'advisory' });
    // The entry-sourced acceptance carries its provenance: the pack that motivated it.
    assert.deepEqual(cfg.accept, [{ rule: 'reference-integrity', path: 'x.md', reason: 'why', pack: 'product-wiki' }]);
  } finally { cleanup(root); }
});

test('loadConfig: a namespaced local-pack declaration normalizes to the bare id everywhere', () => {
  // local_packs/proj is the pre-rename declaration form for a local pack; the
  // normalized view is bare ids, so packEntries lookups (interview answers) and
  // the packConfig view key by the pack's own id whichever form the file used.
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [
      'basics',
      { id: 'local_packs/proj', config: { knob: 1 }, answers: { q: 'a' } },
      'local_packs/other',
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, []);
    assert.deepEqual(cfg.packs, ['basics', 'proj', 'other']);
    assert.deepEqual(cfg.packEntries.find((e) => e.id === 'proj').answers, { q: 'a' });
    assert.deepEqual(cfg.packConfig, { proj: { knob: 1 } });
  } finally { cleanup(root); }
});

test('loadConfig: entry config overlays the legacy top-level packConfig, which stays readable', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['node', { id: 'product-wiki', config: { rules: [] } }],
    packConfig: { node: { dirs: ['fn'] }, 'product-wiki': { rules: [{ from: 'x', to: 'y' }] } },
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, []);
    assert.deepEqual(cfg.packConfig.node, { dirs: ['fn'] }); // legacy still read
    assert.deepEqual(cfg.packConfig['product-wiki'], { rules: [] }); // the entry wins
  } finally { cleanup(root); }
});

test('loadConfig: pack-entry answers — verbatim strings kept, wrong shapes a settings error', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [
      { id: 'product-wiki', answers: { goals: 'keep core off pack names' } },
      { id: 'node', answers: ['nope'] },
      { id: 'html', answers: { q: 7 } },
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.packEntries.find((e) => e.id === 'product-wiki').answers, { goals: 'keep core off pack names' });
    assert.equal(cfg.errors.length, 2);
    assert.match(cfg.errors[0].what, /"answers" on the "node" pack entry must be/);
    assert.match(cfg.errors[1].what, /"answers" on the "html" pack entry must be/);
  } finally { cleanup(root); }
});

test('loadConfig: a malformed pack entry is a settings error — no id, unknown property, wrong shapes', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [
      { config: {} },
      { id: 'basics', nonsense: 1 },
      { id: 'node', config: [] },
      42,
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.equal(cfg.errors.length, 4);
    assert.match(cfg.errors[0].what, /has no "id"/);
    assert.match(cfg.errors[1].what, /unknown property "nonsense" on the "basics" pack entry/);
    assert.match(cfg.errors[2].what, /"config" on the "node" pack entry must be/);
    assert.match(cfg.errors[3].what, /neither a pack id nor an entry object/);
    assert.deepEqual(cfg.packs, ['basics', 'node']); // the interpretable entries still load
  } finally { cleanup(root); }
});

test('loadConfig: conflicting severity overrides are a settings error, agreeing ones are not', () => {
  const conflicted = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [{ id: 'basics', rules: { 'file-placement': 'advisory' } }],
    rules: { 'file-placement': 'off' },
  }) } });
  const agreeing = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: [{ id: 'basics', rules: { 'file-placement': 'off' } }],
    rules: { 'file-placement': 'off' },
  }) } });
  try {
    const bad = loadConfig(conflicted);
    assert.equal(bad.errors.length, 1);
    assert.match(bad.errors[0].what, /rule "file-placement" is set to "off" by the top-level "rules" and "advisory" by the "basics" pack entry/);
    assert.deepEqual(loadConfig(agreeing).errors, []);
    assert.deepEqual(loadConfig(agreeing).rules, { 'file-placement': 'off' });
  } finally { cleanup(conflicted); cleanup(agreeing); }
});

test('loadConfig: malformed JSON and a non-object root each report one error', () => {
  const bad = makeRepo({ changed: { '.claudinite-settings.json': '{ "packs": [ ' } });
  const arr = makeRepo({ changed: { '.claudinite-settings.json': '["basics"]' } });
  try {
    assert.match(loadConfig(bad).errors[0].what, /not valid JSON/);
    assert.match(loadConfig(arr).errors[0].what, /must be a JSON object/);
  } finally { cleanup(bad); cleanup(arr); }
});

test('engine: ctx.files excludes vendored/generated files; ctx.allFiles keeps them', () => {
  // The default sweep is the project's own code — so every check skips third-party
  // and machine-written files for free, not just warning-suppression.
  const root = makeRepo({ changed: {
    '.gitattributes': 'vendor/** linguist-vendored\ngen/** linguist-generated\n',
    'vendor/page.html': '<div>recorded third-party fixture</div>\n',
    'gen/out.js': 'machineWritten();\n',
    'src/mine.js': 'projectCode();\n',
  } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    assert.ok(!ctx.files.includes('vendor/page.html'));
    assert.ok(!ctx.files.includes('gen/out.js'));
    assert.ok(ctx.files.includes('src/mine.js'));
    // The unfiltered set retains them for checks that reason about generated files.
    assert.ok(ctx.allFiles.includes('vendor/page.html'));
    assert.ok(ctx.allFiles.includes('gen/out.js'));
  } finally { cleanup(root); }
});

test('loadConfig: the claudinite vendored-mount stamp is a known setting', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'], claudinite: { updated: '2026-07-17', ref: 'abc123' },
  }) } });
  try {
    assert.deepEqual(loadConfig(root).errors, []);
  } finally { cleanup(root); }
});

test('loadConfig: a valid schedule anchor is a known setting and passes through unchanged', () => {
  const full = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'], taskScheduler: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
  }) } });
  const partial = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'], taskScheduler: { dailyHour: 9 },
  }) } });
  const none = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) } });
  try {
    assert.deepEqual(loadConfig(full).errors, []);
    assert.deepEqual(loadConfig(full).taskScheduler, { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 });
    assert.deepEqual(loadConfig(partial).errors, []); // absent keys are legal — the scheduler fills defaults
    assert.equal(loadConfig(none).taskScheduler, null); // an omitted taskScheduler is not an error
  } finally { cleanup(full); cleanup(partial); cleanup(none); }
});

// REPO SHAPE IS NOT A PRECONDITION (task-preconditions DESIGN): a repo that carries
// a pack but not one task's subject names that task here, and the scheduler reads it
// before instantiating anything. Whether the named task EXISTS is deliberately not
// checked — a member may disable a task in a pack it has not adopted yet, and the
// question is answered where tasks are discovered.
test('loadConfig: taskScheduler.disabledTasks is a known setting, validated as a shape', () => {
  const settings = (taskScheduler) => makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], taskScheduler }) } });
  const ok = settings({ dailyHour: 4, disabledTasks: ['claudinite-lifecycle/update'] });
  const empty = settings({ disabledTasks: [] });
  const notList = settings({ disabledTasks: 'claudinite-lifecycle/update' });
  const notIds = settings({ disabledTasks: ['update'] });
  try {
    assert.deepEqual(loadConfig(ok).errors, []);
    assert.deepEqual(loadConfig(ok).taskScheduler.disabledTasks, ['claudinite-lifecycle/update']);
    assert.deepEqual(loadConfig(empty).errors, []); // disabling nothing is legal, and means nothing is disabled
    for (const bad of [notList, notIds]) {
      const cfg = loadConfig(bad);
      assert.equal(cfg.errors.length, 1);
      assert.match(cfg.errors[0].what, /"taskScheduler\.disabledTasks" must be an array of "<pack>\/<task>" ids/);
    }
  } finally { for (const r of [ok, empty, notList, notIds]) cleanup(r); }
});

test('loadConfig: out-of-range and misshaped schedule values are settings errors', () => {
  const ranges = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'], taskScheduler: { dailyHour: 24, weeklyDay: 'Sunday', monthlyDay: 0, nonsense: 1 },
  }) } });
  const notObject = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'], taskScheduler: [4],
  }) } });
  try {
    const cfg = loadConfig(ranges);
    assert.equal(cfg.errors.length, 4);
    assert.match(cfg.errors[0].what, /unknown "taskScheduler" setting "nonsense"/);
    assert.match(cfg.errors[1].what, /"taskScheduler\.dailyHour" must be an integer 0–23/);
    assert.match(cfg.errors[2].what, /"taskScheduler\.weeklyDay" must be one of/);
    assert.match(cfg.errors[3].what, /"taskScheduler\.monthlyDay" must be an integer 1–31/);
    assert.deepEqual(cfg.packs, ['basics']); // the good keys still load
    const arr = loadConfig(notObject);
    assert.equal(arr.errors.length, 1);
    assert.match(arr.errors[0].what, /"taskScheduler" must be an object/);
  } finally { cleanup(ranges); cleanup(notObject); }
});

// The queue's per-repo cutover key and its endpoint map (tasks-dispatch DESIGN
// §12, §14). `dispatch` now names one mechanism, so anything else — a typo, or the
// deleted `"slots"` — must be a settings error rather than a silent fall-back.
test('loadConfig: taskScheduler.dispatch and the endpoint map are validated', () => {
  const good = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'],
    taskScheduler: { dispatch: 'queue', endpoints: { default: { url: 'https://x.invalid/s', tokenSecret: 'CCR_TOKEN' } } },
  }) } });
  const bad = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['basics'],
    taskScheduler: { dispatch: 'queues', endpoints: { default: { url: 'https://x.invalid/s' } } },
  }) } });
  try {
    const cfg = loadConfig(good);
    assert.deepEqual(cfg.errors, []);
    assert.equal(cfg.taskScheduler.dispatch, 'queue');
    assert.equal(cfg.taskScheduler.endpoints.default.tokenSecret, 'CCR_TOKEN');

    // `slots` is not merely unknown, it is RETIRED: a member still declaring it must
    // hear so rather than get the queue under a declaration that says otherwise.
    const retired = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
      packs: ['basics'], taskScheduler: { dispatch: 'slots' },
    }) } });
    try {
      assert.match(loadConfig(retired).errors[0].what, /"taskScheduler\.dispatch" must be one of queue/);
    } finally { cleanup(retired); }

    const errs = loadConfig(bad).errors;
    assert.equal(errs.length, 2);
    assert.match(errs[0].what, /"taskScheduler\.dispatch" must be one of queue/);
    assert.match(errs[1].what, /"taskScheduler\.agenticTaskInvocationEndpoints\.default" must be \{ url, tokenSecret \}/);
  } finally { cleanup(good); cleanup(bad); }
});

test('buildContext: the shared mount is structurally out of scope; local packs stay in', () => {
  const root = makeRepo({ changed: {
    'src/app.js': 'x\n',
    '.claudinite/shared/packs/basics/RULES.md': 'canon\n',
    '.claudinite/shared/engine/checks/check_the_world.mjs': 'canon\n',
    '.claudinite/local/packs/mine/pack.mjs': 'export default { id: "mine" };\n',
  } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    assert.ok(ctx.files.includes('src/app.js'));
    assert.ok(ctx.files.includes('.claudinite/local/packs/mine/pack.mjs'));
    assert.ok(!ctx.files.some((f) => f.startsWith('.claudinite/shared/')));
    // allFiles honors the same boundary: the corpus is not the project's code.
    assert.ok(!ctx.allFiles.some((f) => f.startsWith('.claudinite/shared/')));
  } finally { cleanup(root); }
});

// A remote-tracking base ref goes stale the moment the base branch moves, and a cloud
// session's clone freezes it at container-creation time. Everything the base gained since
// then sits in `mergeBase..HEAD` and gets billed to the work — squash-merge-history (a
// blocking rule) reporting other people's merge commits as introduced by this change.
test('buildContext: a stale remote base ref is refreshed, so the base branch\'s own merges are not the work\'s', () => {
  const origin = mkdtempSync(join(tmpdir(), 'claudinite-origin-'));
  git(origin, 'init', '-q', '-b', 'main');
  writeFiles(origin, { 'README.md': 'seed\n' });
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'seed');

  const root = mkdtempSync(join(tmpdir(), 'claudinite-clone-'));
  removeTree(root);
  git(process.cwd(), 'clone', '-q', origin, root); // origin/main pinned at seed

  // The base branch advances — including a merge commit — after the clone.
  git(origin, 'checkout', '-q', '-b', 'side');
  writeFiles(origin, { 's.txt': 'x\n' });
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'side work');
  git(origin, 'checkout', '-q', 'main');
  git(origin, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');

  // The session's branch is cut from the *current* base tip, while the clone's
  // origin/main still points at the seed: fetched under its own ref name so the
  // explicit refspec leaves origin/main untouched, exactly as the real clone was.
  git(root, 'fetch', '-q', origin, '+refs/heads/main:refs/remotes/snapshot/main');
  git(root, 'checkout', '-q', '-B', 'feature', 'snapshot/main');
  writeFiles(root, { 'w.txt': 'x\n' });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'my work Refs #1');

  try {
    // Opted out of the refresh: the stale ref is believed, and the base branch's
    // merge is misread as introduced here — the bug, pinned.
    process.env.CLAUDINITE_CHECKS_NO_FETCH = '1';
    const stale = buildContext({ root, mode: 'changed' });
    assert.deepEqual(stale.introducedMergeCommits().map((m) => m.subject), ['merge side']);

    // Default: the ref is refreshed first, so the merge is where it belongs — on the
    // base branch, out of the work's range.
    delete process.env.CLAUDINITE_CHECKS_NO_FETCH;
    const fresh = buildContext({ root, mode: 'changed' });
    assert.deepEqual(fresh.introducedMergeCommits(), []);
  } finally {
    delete process.env.CLAUDINITE_CHECKS_NO_FETCH;
    cleanup(root);
    cleanup(origin);
  }
});

// The refresh runs once per freshness window, not once per run: a Stop hook fires every
// turn, and paying a network fetch per turn is the sweep's dominant wall-clock cost. A
// marker in the git dir records which ref was refreshed and when; within the window the
// stale-tolerance is the same class as the fetch failing (best-effort by construction).
test('buildContext: the base-ref refresh is skipped within the freshness window, and runs again past it', () => {
  const origin = mkdtempSync(join(tmpdir(), 'claudinite-fresh-origin-'));
  git(origin, 'init', '-q', '-b', 'main');
  writeFiles(origin, { 'README.md': 'seed\n' });
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'seed');

  const root = mkdtempSync(join(tmpdir(), 'claudinite-fresh-clone-'));
  removeTree(root);
  git(process.cwd(), 'clone', '-q', origin, root);

  const markerPath = join(root, git(root, 'rev-parse', '--git-path', 'claudinite-base-refresh.json').trim());

  try {
    // First run: fetches (nothing to skip) and stamps the marker.
    buildContext({ root, mode: 'changed' });
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    assert.equal(marker.ref, 'origin/main');

    // The base branch gains a merge, and the work is cut from the advanced tip
    // (fetched under its own ref name, leaving origin/main stale — the cloud-
    // clone shape). A run inside the window skips the fetch, so the stale ref
    // misattributes the base's merge — the bounded staleness, pinned.
    git(origin, 'checkout', '-q', '-b', 'side');
    writeFiles(origin, { 's.txt': 'x\n' });
    git(origin, 'add', '-A');
    git(origin, 'commit', '-q', '-m', 'side work');
    git(origin, 'checkout', '-q', 'main');
    git(origin, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
    git(root, 'fetch', '-q', origin, '+refs/heads/main:refs/remotes/snapshot/main');
    git(root, 'checkout', '-q', '-B', 'feature', 'snapshot/main');
    writeFiles(root, { 'w.txt': 'x\n' });
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'my work Refs #1');
    const inWindow = buildContext({ root, mode: 'changed' });
    assert.deepEqual(inWindow.introducedMergeCommits().map((c) => c.subject), ['merge side']);

    // Aging the marker past the window makes the next run fetch again.
    writeFileSync(markerPath, JSON.stringify({ ref: 'origin/main', at: Date.now() - 60 * 60_000 }));
    const pastWindow = buildContext({ root, mode: 'changed' });
    assert.deepEqual(pastWindow.introducedMergeCommits(), []);

    // A marker for a DIFFERENT ref never suppresses this ref's refresh.
    git(origin, 'checkout', '-q', '-b', 'side2');
    writeFiles(origin, { 's2.txt': 'x\n' });
    git(origin, 'add', '-A');
    git(origin, 'commit', '-q', '-m', 'side2 work');
    git(origin, 'checkout', '-q', 'main');
    git(origin, 'merge', '-q', '--no-ff', '-m', 'merge side2', 'side2');
    writeFileSync(markerPath, JSON.stringify({ ref: 'origin/other', at: Date.now() }));
    const otherRef = buildContext({ root, mode: 'changed' });
    assert.deepEqual(otherRef.introducedMergeCommits(), []);
    assert.equal(JSON.parse(readFileSync(markerPath, 'utf8')).ref, 'origin/main');
  } finally {
    cleanup(root);
    cleanup(origin);
  }
});

// The range alone trusts `git merge-base`, which returns ONE of several equally-good
// answers when the history criss-crosses — and the one it picks can leave a merge that
// already sits on the base branch inside `mergeBase..HEAD`. No fetch can fix that, so the
// candidates are confirmed against the base ref itself.
test('buildContext: a merge already on the base branch is never the work\'s, even when the merge-base says it is in range', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-crisscross-'));
  // `feature` and `basebr` have two equally-good merge-bases — z1 and the shared merge —
  // and git returns the newer-dated one. Dating z1 last is what makes it the answer, which
  // is what leaves the shared merge inside the range: the situation being pinned. Every
  // date is explicit because with the helper's "now" on every commit the pick is a
  // coin-flip and the test flips run to run.
  const T = 1700000000;
  const at = (seconds, ...args) => gitDated(root, T + seconds, ...args);
  const commit = (name, seconds) => {
    writeFiles(root, { [name]: 'x\n' });
    at(seconds, 'add', '-A');
    at(seconds, 'commit', '-q', '-m', name);
  };
  at(0, 'init', '-q', '-b', 'main');
  commit('a', 60);
  at(0, 'checkout', '-q', '-b', 'zed'); commit('z1', 600); // dated last, deliberately
  at(0, 'checkout', '-q', 'main');
  at(0, 'checkout', '-q', '-b', 'pea'); commit('p1', 180);
  at(0, 'checkout', '-q', 'main');
  at(0, 'checkout', '-q', '-b', 'queue'); commit('q1', 240);
  at(0, 'checkout', '-q', 'pea');
  at(300, 'merge', '-q', '--no-ff', '-m', 'shared merge', 'queue');
  const shared = at(0, 'rev-parse', 'HEAD').trim();
  at(0, 'checkout', '-q', '-b', 'feature');
  at(360, 'merge', '-q', '--no-ff', '-m', 'merge zed into feature', 'zed');
  commit('h1', 420);
  at(0, 'checkout', '-q', 'zed');
  at(480, 'merge', '-q', '--no-ff', '-m', 'base takes the shared merge', 'pea');
  at(0, 'branch', '-f', 'basebr', 'zed');
  at(0, 'checkout', '-q', 'feature');

  try {
    // Setup sanity: the shared merge is on the base branch, yet git's chosen merge-base
    // leaves it inside the raw range. If a future git picks the other merge-base this
    // fails loudly rather than passing vacuously.
    git(root, 'merge-base', '--is-ancestor', shared, 'basebr');
    const mergeBase = git(root, 'merge-base', 'HEAD', 'basebr').trim();
    const raw = git(root, 'log', '--merges', '--first-parent', '--format=%H', `${mergeBase}..HEAD`);
    assert.ok(raw.includes(shared), 'setup no longer reproduces the criss-cross merge-base');

    const ctx = buildContext({ root, mode: 'changed', baseOverride: 'basebr' });
    const subjects = ctx.introducedMergeCommits().map((m) => m.subject);
    assert.ok(!subjects.includes('shared merge'));
    // The merge this branch really did introduce still reports.
    assert.deepEqual(subjects, ['merge zed into feature']);
  } finally { cleanup(root); }
});

// ── Every declarable key must survive the load ──────────────────────────────
// The class of bug this closes: `claudinite` and `maintenance` were both in
// CONFIG_KEYS — so declaring them validated clean, with no error — and both were
// then dropped from loadConfig's returned shape. A key legal to write and
// impossible to read is silent in both directions, and this one was expensive:
// the `stamp` signal reads `config.claudinite`, got undefined on every repo, and
// baselining self-skipped as "no vendored mount (no stamp)" across the whole
// fleet while its scheduler runs went green. Observed 2026-07-28 on every
// consumer; nothing had baselined since 07-26.
test('every key in CONFIG_KEYS survives loadConfig — declarable implies readable', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-config-keys-'));
  try {
    writeFiles(root, {
      '.claudinite-settings.json': JSON.stringify({
        packs: ['basics'],
        rules: { 'some-rule': 'advisory' },
        accept: [{ rule: 'some-rule', path: 'x.md', reason: 'because' }],
        sharedConstants: [{ what: 'v', value: '1', counts: { 'a.json': 1 } }],
        dailyClaudiniteUpdatesRequirePrReview: true,
        engineVersion: '60820.1',
        taskScheduler: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
      }, null, 2) + '\n',
    });
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, [], 'the fixture must be a legal settings file');

    // `packConfig` is a derived view rather than a declared key, so it is the one
    // CONFIG_KEYS entry with no verbatim counterpart; everything else must be
    // present and non-undefined.
    for (const key of CONFIG_KEYS) {
      if (key === 'packConfig') continue;
      assert.notEqual(cfg[key], undefined,
        `"${key}" is declarable (it is in CONFIG_KEYS and raises no error) but loadConfig drops it — `
        + 'anything reading config.' + key + ' gets undefined forever');
    }

    // Asserted on their values rather than mere presence — this is what the
    // scheduler's stamp signal and the delivery step actually read.
    assert.equal(cfg.engineVersion, '60820.1');
    assert.equal(cfg.dailyClaudiniteUpdatesRequirePrReview, true);
  } finally { removeTree(root); }
});

// ── dormant: the project's own declaration that it is out of the recurring work ──
test('dormant loads as a boolean — declared true, and false when absent or false', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-dormant-'));
  try {
    writeFiles(root, { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], dormant: true }) + '\n' });
    const on = loadConfig(root);
    assert.deepEqual(on.errors, [], 'declaring dormancy is a legal settings file');
    assert.equal(on.dormant, true);
    assert.equal(isDormant(on), true, 'the predicate reads the loaded config…');
    assert.equal(isDormant({ packs: [], dormant: true }), true, '…and a raw declaration, which is how the fleet sweeps read another repo');

    // Opt-in: absence is active, and so is an explicit false. This is the shape every
    // repo in the fleet has, so it must never drift toward dormant.
    writeFiles(root, { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) + '\n' });
    assert.equal(loadConfig(root).dormant, false);
    writeFiles(root, { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], dormant: false }) + '\n' });
    assert.equal(loadConfig(root).dormant, false);
  } finally { removeTree(root); }
});

test('a non-boolean dormant is a settings error, not a truthy value', () => {
  // `"dormant": "yes"` or `{ "since": … }` reads as dormant to any truthiness test
  // and as active to this one, and the difference is a whole repo's scheduled work.
  // Fail at load rather than silently pick one.
  const root = mkdtempSync(join(tmpdir(), 'claudinite-dormant-bad-'));
  try {
    writeFiles(root, { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], dormant: 'yes' }) + '\n' });
    const cfg = loadConfig(root);
    assert.equal(cfg.errors.length, 1);
    assert.match(cfg.errors[0].what, /"dormant" must be true or false/);
    assert.equal(cfg.dormant, false, 'an invalid declaration is not a dormancy declaration');
  } finally { removeTree(root); }
});

test('an unversioned repo loads as null and {}, never as a zero', () => {
  // The honest negative: a pre-adoption repo has no versions, and the stamp signal
  // must see an absence it can reason about rather than a number that would read as
  // "installed, and ancient".
  const root = mkdtempSync(join(tmpdir(), 'claudinite-config-empty-'));
  try {
    writeFiles(root, { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) + '\n' });
    const cfg = loadConfig(root);
    assert.equal(cfg.engineVersion, null);
    assert.deepEqual(cfg.packVersions, {});
    assert.equal(cfg.dailyClaudiniteUpdatesRequirePrReview, false);
  } finally { removeTree(root); }
});

// THE RENAME'S WHOLE WINDOW (#1252): between the engine landing and a member's own
// converge running the record, a member carries the retired name AND the retired
// blocks. Read wrong, it reads as a repo that declares no packs and has never been
// vendored — an un-adoption, silently, with a green run to show for it.
test('a pre-rename member loads identically to a converged one', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-config-legacy-'));
  try {
    writeFiles(root, {
      '.claudinite-checks.json': JSON.stringify({
        packs: ['basics', { id: 'tidy-repo', config: { k: 1 } }],
        maintenance: { delivery: 'review', mechanism: 'versioned' },
        claudinite: {
          updated: '2026-07-26T20:10:18.694Z',
          ref: 'deadbeef',
          engineVersion: '60820.1',
          // `core` is `claudinite-lifecycle`'s old spelling: a version stamped under a
          // renamed pack's id must still price that pack, not read as never-installed.
          packVersions: { basics: '60801.1', core: '60802.1' },
        },
        taskScheduler: { endpoints: { default: { url: 'u', tokenSecret: 'S' } }, dailyHour: 4 },
      }, null, 2) + '\n',
    });
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, [], 'the retired shape is legal to READ — only nothing writes it');
    assert.deepEqual(cfg.packs, ['basics', 'tidy-repo']);
    assert.equal(cfg.engineVersion, '60820.1');
    assert.deepEqual(cfg.packVersions, { basics: '60801.1', 'claudinite-lifecycle': '60802.1' });
    assert.equal(cfg.dailyClaudiniteUpdatesRequirePrReview, true, 'the retired delivery preference still speaks');
    assert.deepEqual(cfg.packConfig['tidy-repo'], { k: 1 });
  } finally { removeTree(root); }
});

// The new name wins when both are present, so a member mid-record is read from the
// file the record wrote rather than the one it is replacing.
test('the current settings-file name wins over the retired one', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-config-both-'));
  try {
    writeFiles(root, {
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) + '\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['tidy-repo'] }) + '\n',
    });
    assert.deepEqual(loadConfig(root).packs, ['tidy-repo']);
  } finally { removeTree(root); }
});
