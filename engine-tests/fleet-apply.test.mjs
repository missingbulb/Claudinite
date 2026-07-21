import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToRepo } from '../migrations/fleet-apply.mjs';

// The migration APPLY pass — phase 1 of the daily routine, migrations-owned (no
// longer baselining's step). These cover the per-member logic: staging a whole
// migration set, honoring auto/review delivery (with push/pr as legacy aliases),
// the no-op path, and the unrecognized-delivery contract. GitHub I/O is the injected semantic `io` object
// (each method a GitHub MCP tool); the mock below records the write calls. A
// `rewrite` migration is used so no on-disk template is needed (the member file
// supplies the content).

const rwMig = {
  id: 'rw', appliesTo: async () => true,
  rewrite: [{ file: '.github/w.yml', replace: [{ from: 'X@main', to: './x' }] }],
};

// A single-member GitHub mock over the semantic `io` interface. `files` are the
// member's DEFAULT-branch contents, `maintFiles` the maintenance branch's own
// contents (absent → an empty branch), `delivery` its maintenance preference,
// `maintPrOpen` whether an open maintenance PR already exists. Records the
// writes so a test can assert the commit/branch/PR/issue shape.
function memberMock({ files = {}, maintFiles = {}, delivery = 'auto-merge', defaultBranch = 'main', maintPrOpen = false, withUpdateFromBase = false, updateFails = false } = {}) {
  const state = { commits: [], deletes: [], branchCreated: null, prCreated: null, issueCreated: null, updatedFromBase: 0, autoMergeArmed: null };
  const io = {
    getDefaultBranch: async () => defaultBranch,
    read: async (_repo, path, ref) => {
      const tree = ref === 'claudinite/maintenance' ? maintFiles : files;
      if (path === '.claudinite-checks.json' && !(path in tree)) return JSON.stringify({ maintenance: { delivery } });
      return path in tree ? tree[path] : null;
    },
    ensureBranch: async (_repo, branch, from) => { state.branchCreated = { branch, from }; },
    commit: async (_repo, branch, fileList, message) => { state.commits.push({ branch, files: fileList, message }); },
    remove: async (_repo, branch, path) => { state.deletes.push({ branch, path }); return true; },
    hasOpenPr: async () => maintPrOpen,
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

test('applyToRepo (auto): lands via the maintenance PR with auto-merge armed — never a direct commit to main', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' } });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.equal(state.commits.length, 1, 'exactly one commit for the whole set');
  assert.equal(state.commits[0].branch, 'claudinite/maintenance', 'writes go to the maintenance branch, not the default branch');
  assert.deepEqual(state.branchCreated, { branch: 'claudinite/maintenance', from: 'main' });
  assert.deepEqual(state.prCreated, { head: 'claudinite/maintenance', base: 'main' });
  assert.equal(state.autoMergeArmed, 101, 'auto arms auto-merge so GitHub lands the PR once the repo\'s checks pass');
  // the commit carries the rewritten content, as a push_files-shaped file object
  assert.deepEqual(state.commits[0].files, [{ path: '.github/w.yml', content: 'uses: ./x\n' }]);
});

test('applyToRepo: the legacy push/pr delivery values are accepted as aliases for auto/review', async () => {
  const legacyAuto = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'push' });
  await applyToRepo(legacyAuto.io, 'o/r', [rwMig]);
  assert.equal(legacyAuto.state.autoMergeArmed, 101, 'legacy `push` behaves as `auto` — arms auto-merge');
  assert.equal(legacyAuto.state.commits[0].branch, 'claudinite/maintenance', 'never a direct commit to the default branch');

  const legacyReview = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'pr' });
  await applyToRepo(legacyReview.io, 'o/r', [rwMig]);
  assert.equal(legacyReview.state.autoMergeArmed, null, 'legacy `pr` behaves as `review` — never auto-merged');
  assert.equal(legacyReview.state.prCreated.head, 'claudinite/maintenance');
});

test('applyToRepo (review): creates the maintenance branch + PR, commits there, never arms auto-merge', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review' });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.deepEqual(state.branchCreated, { branch: 'claudinite/maintenance', from: 'main' });
  assert.equal(state.commits[0].branch, 'claudinite/maintenance');
  assert.deepEqual(state.prCreated, { head: 'claudinite/maintenance', base: 'main' });
  assert.equal(state.autoMergeArmed, null, 'review leaves the PR for the owner — never auto-merged');
});

test('applyToRepo (review): an already-open maintenance PR is not re-created', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', maintPrOpen: true });
  await applyToRepo(io, 'o/r', [rwMig]);
  assert.equal(state.commits[0].branch, 'claudinite/maintenance');
  assert.equal(state.prCreated, null, 'no second PR when one is already open');
});

test('applyToRepo (review, #332): the end-state is computed against the DEFAULT branch, not the maintenance branch’s stale copy', async () => {
  const { io, state } = memberMock({
    files: { '.github/w.yml': 'uses: X@main\n' },
    maintFiles: { '.github/w.yml': 'some stale nightly output\n' },
    delivery: 'review', maintPrOpen: true,
  });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.deepEqual(state.commits[0].files, [{ path: '.github/w.yml', content: 'uses: ./x\n' }],
    'content derives from the default branch, regenerated over whatever the branch held');
});

test('applyToRepo (review, #332): a branch already carrying the writes gets no nightly commit (quiet), ids stay empty', async () => {
  const { io, state } = memberMock({
    files: { '.github/w.yml': 'uses: X@main\n' }, // default branch still legacy (PR unmerged)
    maintFiles: { '.github/w.yml': 'uses: ./x\n' }, // branch already migrated
    delivery: 'review', maintPrOpen: true,
  });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, [], 'nothing written tonight, so nothing feeds appliedThisCycle');
  assert.equal(state.commits.length, 0, 'an unmerged PR must not collect identical nightly commits');
});

test('applyToRepo (review, #332): the branch is refreshed from base before staging; a conflict is noted, never fatal', async () => {
  const ok = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', maintPrOpen: true, withUpdateFromBase: true });
  await applyToRepo(ok.io, 'o/r', [rwMig]);
  assert.equal(ok.state.updatedFromBase, 1);
  assert.equal(ok.state.commits.length, 1);

  const conflicted = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'review', maintPrOpen: true, withUpdateFromBase: true, updateFails: true });
  const { note } = await applyToRepo(conflicted.io, 'o/r', [rwMig]);
  assert.match(note, /could not update from base: merge conflict/);
  assert.equal(conflicted.state.commits.length, 1, 'the regenerated writes still land');
});

test('applyToRepo: a member already on the canonical shape is a no-op (no commit)', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: ./x\n' } });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, []);
  assert.equal(state.commits.length, 0);
});

test('applyToRepo: an unrecognized delivery opens an issue and applies nothing', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'weird' });
  const { ids, note } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, []);
  assert.ok(state.issueCreated, 'an issue was opened');
  assert.equal(state.commits.length, 0);
  assert.match(note, /unrecognized delivery/);
});

test('applyToRepo: an unreadable repo (no default branch) applies nothing', async () => {
  const { io, state } = memberMock();
  io.getDefaultBranch = async () => null;
  const { ids, note } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, []);
  assert.equal(state.commits.length, 0);
  assert.match(note, /unreadable/);
});
