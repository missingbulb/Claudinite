import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSignals, SIGNAL_COLLECTORS } from '../signals/index.mjs';
import { logFilename } from '../../claudinite-growth/capture-log.mjs';

// A fake gh keyed by regex → response (matches the fleet planner's test seam).
const fakeGh = (routes) => async (path) => {
  for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
  return { status: 404, json: null };
};
const ctx = (over = {}) => ({ repo: 'o/r', defaultBranch: 'main', sinceIso: '2026-07-21T00:00:00Z', now: '2026-07-22T00:00:00Z', ...over });

test('the collector set is the DESIGN §3.3 vocabulary', () => {
  assert.deepEqual(SIGNAL_COLLECTORS.sort(), [
    'branches', 'commits', 'conversationLogs', 'fleet', 'issues',
    'localPacks', 'prs', 'release', 'request', 'sharedMount', 'stamp',
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

// --- branches: names for the scope, `touched` for the newness gate -----------
// The branch dimension had no notion of newness at all — the collector returned
// names — so every precondition over it degenerated to "a branch exists" and swept
// the same standing pile forever. The tip-commit date is the only newness a branch
// has, and no REST listing carries it, so it costs one read per distinct tip.

const branchList = (branches, dates) => fakeGh([
  [/\/branches\?/, { status: 200, json: branches.map(([name, sha]) => ({ name, commit: { sha } })) }],
  [/\/commits\/(.+)$/, (p) => {
    const sha = p.split('/commits/')[1];
    return sha in dates
      ? { status: 200, json: { commit: { committer: { date: dates[sha] } } } }
      : { status: 404, json: null };
  }],
]);

test('branches: a branch whose tip moved in the window is touched; the standing pile is not', async () => {
  const gh = branchList(
    [['main', 'm1'], ['feat-x', 'x1'], ['old-thing', 'o1']],
    { m1: '2026-07-21T09:00:00Z', x1: '2026-07-21T12:00:00Z', o1: '2026-05-02T09:00:00Z' },
  );
  const out = await collectSignals(gh, ctx(), ['branches']); // window opens 2026-07-21T00:00Z
  assert.deepEqual(out.branches.names, ['main', 'feat-x', 'old-thing']);
  assert.deepEqual(out.branches.touched, ['main', 'feat-x']);
  assert.deepEqual(out.branches.list.find((b) => b.name === 'old-thing'), { name: 'old-thing', updatedAt: '2026-05-02T09:00:00Z' });
});

test('branches: branches sharing a tip cost one read, and an unreadable tip is never touched', async () => {
  let reads = 0;
  const inner = branchList(
    [['a', 's1'], ['b', 's1'], ['gone', 's2']],
    { s1: '2026-07-21T09:00:00Z' }, // s2 404s
  );
  const gh = async (path) => { if (/\/commits\//.test(path)) reads += 1; return inner(path); };

  const out = await collectSignals(gh, ctx(), ['branches']);
  assert.equal(reads, 2, 'the shared tip sha was read twice');
  assert.deepEqual(out.branches.touched, ['a', 'b']);
  // No proof of movement never wakes an agent — it does not degrade to "touched".
  assert.equal(out.branches.list.find((b) => b.name === 'gone').updatedAt, null);
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

// --- prs: recently MERGED PRs, in a field of their own -----------------------
// A PR merged during the window is the richest lesson source there is (review
// discussion, what changed and why) and was unreachable while this collector
// queried `state=open` only. It lands in `merged`, NOT folded into `open` or
// `touched`, because those two are other tasks' target sets.

const OPEN_PRS = [{ number: 7, title: 'still open', updated_at: '2026-07-21T12:00:00Z' }];

test('prs: merged-in-window PRs arrive under `merged`, leaving `open`/`touched` alone', async () => {
  const gh = fakeGh([
    [/\/pulls\?state=open/, { status: 200, json: OPEN_PRS }],
    [/\/pulls\?state=closed/, { status: 200, json: [
      { number: 11, title: 'fix the parser', updated_at: '2026-07-21T18:00:00Z', merged_at: '2026-07-21T18:00:00Z', user: { login: 'dev' } },
      { number: 12, title: 'closed, never merged', updated_at: '2026-07-21T17:00:00Z', merged_at: null, user: { login: 'dev' } },
      { number: 13, title: 'merged before the window', updated_at: '2026-07-21T09:00:00Z', merged_at: '2026-07-01T00:00:00Z', user: { login: 'dev' } },
    ] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['prs']);
  assert.deepEqual(out.prs.merged.map((p) => p.number), [11]);
  assert.equal(out.prs.merged[0].title, 'fix the parser');
  assert.equal(out.prs.merged[0].mergedAt, '2026-07-21T18:00:00Z');
  // The fields other tasks read are untouched by the widening.
  assert.deepEqual(out.prs.open.map((p) => p.number), [7]);
  assert.deepEqual(out.prs.touched, [7]);
});

test('prs: the growth tasks\' own merged PRs and bot PRs stay out of `merged`', async () => {
  // Same exclusions `commits` and `issues` apply, so extract cannot mine its own
  // output back into itself — the self-trigger guard must survive the widening.
  const gh = fakeGh([
    [/\/pulls\?state=open/, { status: 200, json: [] }],
    [/\/pulls\?state=closed/, { status: 200, json: [
      { number: 21, title: 'Claudinite growth: extract lessons', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dev' } },
      { number: 22, title: 'Claudinite growth: conversation extract', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dev' } },
      { number: 23, title: '[claudinite-task] grow/x d2026-07-21', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dev' } },
      { number: 24, title: 'Baselining: refresh mount', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dev' } },
      { number: 25, title: 'bump deps', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dependabot[bot]' } },
      { number: 26, title: 'real work worth a lesson', updated_at: '2026-07-21T12:00:00Z', merged_at: '2026-07-21T12:00:00Z', user: { login: 'dev' } },
    ] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['prs']);
  assert.deepEqual(out.prs.merged.map((p) => p.number), [26]);
});

test('prs: the closed listing stops at the window edge instead of paging the repo\'s history', async () => {
  // `sort=updated&direction=desc` means the first out-of-window item ends it — a
  // repo with thousands of closed PRs must not cost thousands of reads.
  const closedPage = (n, updated) => Array.from({ length: n }, (_, i) => ({
    number: 100 + i, title: `pr ${i}`, updated_at: updated, merged_at: updated, user: { login: 'dev' },
  }));
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    if (/\/pulls\?state=open/.test(path)) return { status: 200, json: [] };
    if (/\/pulls\?state=closed/.test(path)) {
      // A full page whose last entry is already outside the window.
      return { status: 200, json: [...closedPage(99, '2026-07-21T12:00:00Z'), {
        number: 999, title: 'ancient', updated_at: '2026-01-01T00:00:00Z', merged_at: '2026-01-01T00:00:00Z', user: { login: 'dev' },
      }] };
    }
    return { status: 404, json: null };
  };
  const out = await collectSignals(gh, ctx(), ['prs']);
  assert.equal(out.prs.merged.length, 99);
  assert.equal(seen.filter((p) => /state=closed/.test(p)).length, 1, `paged past the window edge: ${seen}`);
});

test('issues: dispatch issues and trackers are invisible; touched respects the window', async () => {
  const gh = fakeGh([
    [/\/issues\?state=open/, { status: 200, json: [
      { number: 1, title: 'real feature request', updated_at: '2026-07-21T12:00:00Z', labels: [] },
      { number: 2, title: '[claudinite-task] p/t d2026-07-21', updated_at: '2026-07-21T12:00:00Z' },
      { number: 3, title: 'Claudinite tracker: Repo Tidy', updated_at: '2026-07-21T12:00:00Z' },
      // ci-performance's tracker predates the naming convention (#904), so the
      // prefix alone does not hide it and tidy-issues triaged it as project work.
      { number: 8, title: '[claudinite] CI performance', updated_at: '2026-07-21T12:00:00Z' },
      // The schedule board (#1115): every rewrite bumps updated_at, so letting
      // it through would wake tidy-issues on the queue's own churn (F8).
      { number: 6, title: '[claudinite-schedule] the schedule board', updated_at: '2026-07-21T12:00:00Z' },
      { number: 7, title: '[claudinite-work] p/t', updated_at: '2026-07-21T12:00:00Z' },
      { number: 4, title: 'old issue', updated_at: '2026-07-01T00:00:00Z', labels: [] },
      { number: 5, title: 'a PR', updated_at: '2026-07-21T12:00:00Z', pull_request: {} },
    ] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['issues']);
  assert.deepEqual(out.issues.open.map((i) => i.number), [1, 4]);
  assert.deepEqual(out.issues.touched, [1]); // #4 is outside the window
});

// --- conversationLogs: the age of the oldest log, not just "a branch exists" ---
// The collector's whole job on a quiet repo is to say whether anything is ACTUALLY
// prunable. Returning only `{ present, retentionDays }` made every repo with a
// logs branch look prunable every day.

const logsTree = (names) => [
  [/\/branches\/conversation-logs/, { status: 200, json: { name: 'conversation-logs' } }],
  [/\/git\/trees\/conversation-logs/, { status: 200, json: { tree: names.map((p) => ({ path: p, type: 'blob' })) } }],
];

test('conversationLogs: the age of the OLDEST jsonl, from its filename stamp', async () => {
  const gh = fakeGh(logsTree([
    'README.md',
    '2026-07-12T0940Z--issue-123--sess-a.jsonl',
    '2026-07-20T1100Z--issue-124--sess-b.jsonl',
  ]));
  const out = await collectSignals(gh, ctx({ retentionDays: 10 }), ['conversationLogs']);
  assert.equal(out.conversationLogs.present, true);
  assert.equal(out.conversationLogs.retentionDays, 10);
  assert.equal(out.conversationLogs.logCount, 2);          // README.md is not a log
  // now = 2026-07-22T00:00Z; oldest stamp = 2026-07-12T09:40Z
  assert.ok(Math.abs(out.conversationLogs.oldestLogAgeDays - 9.5972) < 0.001,
    `oldestLogAgeDays was ${out.conversationLogs.oldestLogAgeDays}`);
});

test('conversationLogs: no branch, and a branch with no logs, are both "nothing prunable"', async () => {
  const none = await collectSignals(fakeGh([]), ctx({ retentionDays: 10 }), ['conversationLogs']);
  assert.equal(none.conversationLogs.present, false);
  assert.equal(none.conversationLogs.oldestLogAgeDays, null);

  const empty = await collectSignals(fakeGh(logsTree(['README.md'])), ctx({ retentionDays: 10 }), ['conversationLogs']);
  assert.equal(empty.conversationLogs.present, true);
  assert.equal(empty.conversationLogs.oldestLogAgeDays, null); // branch, but nothing to age out
  assert.equal(empty.conversationLogs.logCount, 0);
});

test('conversationLogs: an unreadable tree degrades to "no age", never an error', async () => {
  const gh = fakeGh([[/\/branches\/conversation-logs/, { status: 200, json: {} }]]); // tree read 404s
  const out = await collectSignals(gh, ctx({ retentionDays: 10 }), ['conversationLogs']);
  assert.equal(out.conversationLogs.present, true);
  assert.equal(out.conversationLogs.oldestLogAgeDays, null);
  assert.equal(out.conversationLogs.error, undefined);
});

// The drift guard for the one format read across the engine/pack seam: the
// collector re-implements the stamp parse (the engine does not import a pack), so
// pin it to the writer. Change `logFilename` without changing the collector and
// this fails, instead of the prune silently never firing again.
test('conversationLogs: the collector parses exactly what the pack\'s capture step writes', async () => {
  const name = logFilename('2026-07-12T09:40:00Z', 123, 'sess-a');
  const gh = fakeGh(logsTree([name]));
  const out = await collectSignals(gh, ctx({ retentionDays: 10 }), ['conversationLogs']);
  assert.equal(out.conversationLogs.logCount, 1, `collector did not recognize ${name} as a log`);
});

// NOTE — every test in this file hand-builds `ctx`, which proves the COLLECTOR
// and says nothing about whether the real run populates the key it reads. That
// gap is how `manifestVersion`, `hasLocalPacks` and `retentionDays` stayed dead
// while green here. Reachability is asserted in signal-context.test.mjs, which
// drives a checkout on disk through the real buildSignalContext; keep any new
// `ctx({ ... })` key covered there too.
test('release: a 404 latest release means no release yet', async () => {
  const gh = fakeGh([[/\/releases\/latest/, { status: 404, json: null }]]);
  const out = await collectSignals(gh, ctx({ manifestVersion: '1.2.0' }), ['release']);
  // shipsPipeline is null here, not false: the ctx seam supplies no checkout, and
  // "the collector could not read one" is not the same answer as "it does not ship".
  assert.deepEqual(out.release, { latestTag: null, manifestVersion: '1.2.0', shipsPipeline: null });
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

// The mount's own movement, never a datetime in the declaration: the one that used
// to be stamped there recorded the last FULL re-vendor, so a member converging
// nightly read as months overdue forever (#1252).
test('stamp: the installed versions, and whether the mount moved in the window', async () => {
  const config = { engineVersion: '60820.1', packVersions: { basics: '60819.1' } };
  const moved = await collectSignals(fakeGh([]), ctx({
    config,
    commits: [{ files: ['.claudinite/shared/engine/version.mjs'] }],
  }), ['stamp']);
  assert.equal(moved.stamp.present, true);
  assert.equal(moved.stamp.engineVersion, '60820.1');
  assert.deepEqual(moved.stamp.packVersions, { basics: '60819.1' });
  assert.equal(moved.stamp.convergedInWindow, true);

  const still = await collectSignals(fakeGh([]), ctx({ config, commits: [{ files: ['src/app.js'] }] }), ['stamp']);
  assert.equal(still.stamp.convergedInWindow, false, 'project work is not a converge');

  // A repo that has never been vendored records neither number, which is what
  // "no mount" means now that no datetime says it.
  const none = await collectSignals(fakeGh([]), ctx({ config: {}, commits: [] }), ['stamp']);
  assert.equal(none.stamp.present, false);
});

test('a collector that throws is isolated under its key', async () => {
  const gh = fakeGh([[/\/branches\?/, () => { throw new Error('boom'); }]]);
  const out = await collectSignals(gh, ctx(), ['branches']);
  assert.match(out.branches.error, /boom/);
});

// --- commits: Claudinite's own corpus is not project work --------------------
// A commit touching nothing but `.claudinite/` moves the repo's working rules,
// not the project. It implements no issue (tidy-issues), ships no user-visible
// change (store-release) and is not a lesson to extract (growth-extract) — yet a
// human-authored one wearing an ordinary message passed every existing exclusion,
// so the growth lifecycle's own landed output re-armed it the next night and a
// repo could never go quiet (TLDR #319).

test('commits: a .claudinite/-only commit is not substantive', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [
      { sha: 'e', commit: { message: 'Restore the pack-scope rule growth-dedup pruned' }, author: { login: 'dev' } },
    ] }],
    [/\/commits\/e$/, { status: 200, json: { files: [{ filename: '.claudinite/local/packs/tldr/RULES.md' }] } }],
  ]);
  const out = await collectSignals(gh, ctx(), ['commits']);
  assert.equal(out.commits.substantiveChange, false);
});

test('commits: a commit touching .claudinite/ AND project code stays substantive', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [
      { sha: 'f', commit: { message: 'Add the thing, and a rule about it' }, author: { login: 'dev' } },
    ] }],
    [/\/commits\/f$/, { status: 200, json: { files: [
      { filename: '.claudinite/local/packs/x/RULES.md' }, { filename: 'src/app.js' },
    ] } }],
  ]);
  const out = await collectSignals(gh, ctx(), ['commits']);
  assert.equal(out.commits.substantiveChange, true);
});

// An unreadable commit detail yields `files: []`. Unknown is not "touched only
// .claudinite/" — vacuous `every` would silently retire the trigger for every
// commit the API would not detail.
test('commits: an unreadable file list never reads as .claudinite/-only', async () => {
  const gh = fakeGh([
    [/\/commits\?sha=/, { status: 200, json: [
      { sha: 'g', commit: { message: 'real work' }, author: { login: 'dev' } },
    ] }],
    // no /commits/g route → 404 → files: []
  ]);
  const out = await collectSignals(gh, ctx(), ['commits']);
  assert.deepEqual(out.commits.touchedPaths, []);
  assert.equal(out.commits.substantiveChange, true);
});

// An open PR carries the paths it changes, so a precondition can rule on what is
// pending rather than on a marker somebody has to remember to apply (wiki-growth
// declines while a `product-wiki/` change waits for review).
test('prs: an open PR carries its changed paths, and an unreadable file list is unknown', async () => {
  const gh = fakeGh([
    [/\/pulls\?state=open/, { status: 200, json: [
      { number: 7, title: 'wiki round', updated_at: '2026-07-21T12:00:00Z' },
      { number: 8, title: 'unreadable', updated_at: '2026-07-21T12:00:00Z' },
    ] }],
    [/\/pulls\?state=closed/, { status: 200, json: [] }],
    [/\/pulls\/7\/files/, { status: 200, json: [
      { filename: 'product-wiki/Market/README.md' },
      { filename: 'product-wiki/sample-data/x.csv' },
    ] }],
  ]);
  const out = await collectSignals(gh, ctx(), ['prs']);
  const by = Object.fromEntries(out.prs.open.map((p) => [p.number, p.changedPaths]));
  assert.deepEqual(by[7], ['product-wiki/Market/README.md', 'product-wiki/sample-data/x.csv']);
  // Every PR changes at least one file, so nothing read is a read that failed —
  // `null`, the third state, never an empty list a path gate would read as "clear".
  assert.equal(by[8], null);
});
