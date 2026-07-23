import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToRepo, maintenanceBranchName } from '../migrations/fleet-apply.mjs';

// The migration APPLY pass — phase 1 of the daily routine, migrations-owned (no
// longer baselining's step). These cover the per-member logic: staging a whole
// migration set, honoring auto/review delivery (with push/pr as legacy aliases),
// the no-op path, and the unrecognized-delivery contract. GitHub I/O is the injected semantic `io` object
// (each method a GitHub MCP tool); the mock below records the write calls. A
// `rewrite` migration is used so no on-disk template is needed (the member file
// supplies the content).
//
// The delivery branch is per-cycle now (claudinite/maintenance-<date>-<seed>), not a
// single stable name: a fresh cycle mints one (the run's shared name is passed via
// opts.branch); a run with an open maintenance PR reuses it (found by head prefix).

// The run's shared maintenance branch name (a fixed value stands in for the
// orchestrator-generated date+seed name so the assertions are deterministic).
const RUN_BRANCH = 'claudinite/maintenance-2026-01-02-abc123';
// A prior cycle's still-open delivery branch, reused when a maintenance PR is open.
const OPEN_HEAD = 'claudinite/maintenance-2026-01-01-old999';

const rwMig = {
  id: 'rw', appliesTo: async () => true,
  rewrite: [{ file: '.github/w.yml', replace: [{ from: 'X@main', to: './x' }] }],
};

// A single-member GitHub mock over the semantic `io` interface. `files` are the
// member's DEFAULT-branch contents, `maintFiles` the maintenance branch's own
// contents (absent → an empty branch), `delivery` its maintenance preference,
// `openMaintHead` the head branch of an already-open maintenance PR (null → none).
// Records the writes so a test can assert the commit/branch/PR/issue shape.
function memberMock({ files = {}, maintFiles = {}, delivery = 'auto-merge', defaultBranch = 'main', openMaintHead = null, withUpdateFromBase = false, updateFails = false } = {}) {
  const state = { commits: [], deletes: [], branchCreated: null, prCreated: null, issueCreated: null, updatedFromBase: 0, autoMergeArmed: null };
  const io = {
    getDefaultBranch: async () => defaultBranch,
    read: async (_repo, path, ref) => {
      const tree = ref && ref.startsWith('claudinite/maintenance') ? maintFiles : files;
      if (path === '.claudinite-checks.json' && !(path in tree)) return JSON.stringify({ maintenance: { delivery } });
      return path in tree ? tree[path] : null;
    },
    ensureBranch: async (_repo, branch, from) => { state.branchCreated = { branch, from }; },
    commit: async (_repo, branch, fileList, message) => { state.commits.push({ branch, files: fileList, message }); },
    remove: async (_repo, branch, path) => { state.deletes.push({ branch, path }); return true; },
    findOpenPrByPrefix: async (_repo, prefix) => (openMaintHead && openMaintHead.startsWith(prefix) ? openMaintHead : null),
    openPr: async (_repo, head, base) => { state.prCreated = { head, base }; return 101; },
    enableAutoMerge: async (_repo, prNumber) => { state.autoMergeArmed = prNumber; },
    openIssue: async (_repo, title, body) => { state.issueCreated = { title, body }; },
  };
  if (withUpdateFromBase) {
    io.updateBranchFromBase = async () => {
      state.updatedFromBase += 1;
      if (updateFails) throw new Error('merge conflict');
    };
  }
  return { io, state };
}

test('maintenanceBranchName: a dated, seeded name under the claudinite/maintenance prefix', () => {
  assert.match(maintenanceBranchName(), /^claudinite\/maintenance-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  // The random seed makes successive names distinct (a fresh branch per cycle).
  assert.notEqual(maintenanceBranchName(), maintenanceBranchName());
});

test('applyToRepo (auto): mints the run\'s dated branch + PR with auto-merge armed — never a direct commit to main', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' } });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, ['rw']);
  assert.equal(state.commits.length, 1, 'exactly one commit for the whole set');
  assert.equal(state.commits[0].branch, RUN_BRANCH, 'writes go to the run\'s maintenance branch, not the default branch');
  assert.deepEqual(state.branchCreated, { branch: RUN_BRANCH, from: 'main' });
  assert.deepEqual(state.prCreated, { head: RUN_BRANCH, base: 'main' });
  assert.equal(state.autoMergeArmed, 101, 'auto arms auto-merge so GitHub lands the PR once the repo\'s checks pass');
  // the commit carries the rewritten content, as a push_files-shaped file object
  assert.deepEqual(state.commits[0].files, [{ path: '.github/w.yml', content: 'uses: ./x\n' }]);
});

test('applyToRepo: with no run branch handed and no open PR, a fresh dated branch is minted per repo', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' } });
  await applyToRepo(io, 'o/r', [rwMig]); // no opts.branch
  assert.match(state.branchCreated.branch, /^claudinite\/maintenance-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  assert.equal(state.prCreated.head, state.branchCreated.branch, 'the PR opens on the freshly-minted branch');
});

test('applyToRepo: the legacy push/pr delivery values are accepted as aliases for auto/review', async () => {
  const legacyAuto = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'push' });
  await applyToRepo(legacyAuto.io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.equal(legacyAuto.state.autoMergeArmed, 101, 'legacy `push` behaves as `auto` — arms auto-merge');
  assert.equal(legacyAuto.state.commits[0].branch, RUN_BRANCH, 'never a direct commit to the default branch');

  const legacyReview = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'pr' });
  await applyToRepo(legacyReview.io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.equal(legacyReview.state.autoMergeArmed, null, 'legacy `pr` behaves as `review` — never auto-merged');
  assert.equal(legacyReview.state.prCreated.head, RUN_BRANCH);
});

test('applyToRepo (review): mints the run\'s dated branch + PR, commits there, never arms auto-merge', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review' });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, ['rw']);
  assert.deepEqual(state.branchCreated, { branch: RUN_BRANCH, from: 'main' });
  assert.equal(state.commits[0].branch, RUN_BRANCH);
  assert.deepEqual(state.prCreated, { head: RUN_BRANCH, base: 'main' });
  assert.equal(state.autoMergeArmed, null, 'review leaves the PR for the owner — never auto-merged');
});

test('applyToRepo (review): an already-open maintenance PR is reused by prefix, not a second PR', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', openMaintHead: OPEN_HEAD });
  await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.equal(state.commits[0].branch, OPEN_HEAD, 'the commit lands on the reused cycle branch, not the run\'s fresh name');
  assert.equal(state.prCreated, null, 'no second PR when one is already open');
});

test('applyToRepo (review, #332): the end-state is computed against the DEFAULT branch, not the delivery branch’s stale copy', async () => {
  const { io, state } = memberMock({
    files: { '.github/w.yml': 'uses: X@main\n' },
    maintFiles: { '.github/w.yml': 'some stale nightly output\n' },
    delivery: 'review', openMaintHead: OPEN_HEAD,
  });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, ['rw']);
  assert.deepEqual(state.commits[0].files, [{ path: '.github/w.yml', content: 'uses: ./x\n' }],
    'content derives from the default branch, regenerated over whatever the branch held');
});

test('applyToRepo (review, #332): a reused branch already carrying the writes gets no nightly commit (quiet), ids stay empty', async () => {
  const { io, state } = memberMock({
    files: { '.github/w.yml': 'uses: X@main\n' }, // default branch still legacy (PR unmerged)
    maintFiles: { '.github/w.yml': 'uses: ./x\n' }, // branch already migrated
    delivery: 'review', openMaintHead: OPEN_HEAD,
  });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, [], 'nothing written tonight, so nothing feeds appliedThisCycle');
  assert.equal(state.commits.length, 0, 'an unmerged PR must not collect identical nightly commits');
});

test('applyToRepo (review, #332): a reused branch is refreshed from base before staging; a conflict is noted, never fatal', async () => {
  const ok = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', openMaintHead: OPEN_HEAD, withUpdateFromBase: true });
  await applyToRepo(ok.io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.equal(ok.state.updatedFromBase, 1);
  assert.equal(ok.state.commits.length, 1);

  const conflicted = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', openMaintHead: OPEN_HEAD, withUpdateFromBase: true, updateFails: true });
  const { note } = await applyToRepo(conflicted.io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.match(note, /could not update from base: merge conflict/);
  assert.equal(conflicted.state.commits.length, 1, 'the regenerated writes still land');
});

test('applyToRepo: a freshly-minted branch is not refreshed from base (it is already at base)', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, withUpdateFromBase: true });
  await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.equal(state.updatedFromBase, 0, 'no update-from-base when no open PR was reused');
});

test('applyToRepo: a member already on the canonical shape is a no-op (no commit)', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: ./x\n' } });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, []);
  assert.equal(state.commits.length, 0);
});

test('applyToRepo: an unrecognized delivery opens an issue and applies nothing', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'weird' });
  const { ids, note } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, []);
  assert.ok(state.issueCreated, 'an issue was opened');
  assert.equal(state.commits.length, 0);
  assert.match(note, /unrecognized delivery/);
});

test('applyToRepo: an unreadable repo (no default branch) applies nothing', async () => {
  const { io, state } = memberMock();
  io.getDefaultBranch = async () => null;
  const { ids, note } = await applyToRepo(io, 'o/r', [rwMig], { branch: RUN_BRANCH });
  assert.deepEqual(ids, []);
  assert.equal(state.commits.length, 0);
  assert.match(note, /unreadable/);
});
