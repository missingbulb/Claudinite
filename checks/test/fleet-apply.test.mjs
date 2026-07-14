import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToRepo } from '../../migrations/fleet-apply.mjs';

// The migration APPLY pass — phase 1 of the daily routine, migrations-owned (no
// longer baselining's step). These cover the per-member logic: staging a whole
// migration set, honoring push/pr delivery, the no-op path, and the
// unrecognized-delivery contract. GitHub I/O is the injected semantic `io` object
// (each method a GitHub MCP tool); the mock below records the write calls. A
// `rewrite` migration is used so no on-disk template is needed (the member file
// supplies the content).

const rwMig = {
  id: 'rw', appliesTo: async () => true,
  rewrite: [{ file: '.github/w.yml', replace: [{ from: 'X@main', to: './x' }] }],
};

// A single-member GitHub mock over the semantic `io` interface. `files` are the
// member's current contents, `delivery` its maintenance preference, `maintPrOpen`
// whether an open maintenance PR already exists. Records the writes so a test can
// assert the commit/branch/PR/issue shape.
function memberMock({ files = {}, delivery = 'push', defaultBranch = 'main', maintPrOpen = false } = {}) {
  const state = { commits: [], deletes: [], branchCreated: null, prCreated: null, issueCreated: null };
  const io = {
    getDefaultBranch: async () => defaultBranch,
    read: async (_repo, path) => {
      if (path === '.claudinite-checks.json') return JSON.stringify({ maintenance: { delivery } });
      return path in files ? files[path] : null;
    },
    ensureBranch: async (_repo, branch, from) => { state.branchCreated = { branch, from }; },
    commit: async (_repo, branch, fileList, message) => { state.commits.push({ branch, files: fileList, message }); },
    remove: async (_repo, branch, path) => { state.deletes.push({ branch, path }); return true; },
    hasOpenPr: async () => maintPrOpen,
    openPr: async (_repo, head, base) => { state.prCreated = { head, base }; },
    openIssue: async (_repo, title, body) => { state.issueCreated = { title, body }; },
  };
  return { io, state };
}

test('applyToRepo (push): one commit on the default branch, the migration id returned', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' } });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.equal(state.commits.length, 1, 'exactly one commit for the whole set');
  assert.equal(state.commits[0].branch, 'main');
  assert.equal(state.branchCreated, null);
  assert.equal(state.prCreated, null);
  // the commit carries the rewritten content, as a push_files-shaped file object
  assert.deepEqual(state.commits[0].files, [{ path: '.github/w.yml', content: 'uses: ./x\n' }]);
});

test('applyToRepo (pr): creates the maintenance branch + PR, commits there', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'pr' });
  const { ids } = await applyToRepo(io, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.deepEqual(state.branchCreated, { branch: 'claudinite/maintenance', from: 'main' });
  assert.equal(state.commits[0].branch, 'claudinite/maintenance');
  assert.deepEqual(state.prCreated, { head: 'claudinite/maintenance', base: 'main' });
});

test('applyToRepo (pr): an already-open maintenance PR is not re-created', async () => {
  const { io, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'pr', maintPrOpen: true });
  await applyToRepo(io, 'o/r', [rwMig]);
  assert.equal(state.commits[0].branch, 'claudinite/maintenance');
  assert.equal(state.prCreated, null, 'no second PR when one is already open');
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
