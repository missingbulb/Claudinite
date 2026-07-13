import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToRepo } from '../../migrations/fleet-apply.mjs';

// The migration APPLY pass — phase 1 of the daily routine, migrations-owned (no
// longer baselining's step). These cover the per-member logic: staging a whole
// migration set into ONE commit via the Git Data API, honoring push/pr delivery,
// the no-op path, and the unrecognized-delivery contract. A `rewrite` migration is
// used so no on-disk template is needed (the member file supplies the content).

const rwMig = {
  id: 'rw', appliesTo: async () => true,
  rewrite: [{ file: '.github/w.yml', replace: [{ from: 'X@main', to: './x' }] }],
};

// A single-member GitHub mock: `files` are the member's current contents, `delivery`
// its maintenance preference. Records the git-data calls so a test can assert the
// commit shape.
function memberMock({ files = {}, delivery = 'push', defaultBranch = 'main', maintExists = false } = {}) {
  const state = { blobs: [], commits: [], trees: [], refUpdated: null, branchCreated: false, prCreated: false, issueCreated: false };
  const gh = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    const p = path.split('?')[0];
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p) && method === 'GET') return { status: 200, json: { default_branch: defaultBranch } };
    if (p.includes('/contents/')) {
      const rel = p.split('/contents/')[1];
      if (rel === '.claudinite-checks.json') {
        return { status: 200, json: { content: Buffer.from(JSON.stringify({ maintenance: { delivery } })).toString('base64') } };
      }
      if (rel in files) return { status: 200, json: { content: Buffer.from(files[rel]).toString('base64') } };
      return { status: 404, json: {} };
    }
    if (p.endsWith('/git/refs') && method === 'POST') { state.branchCreated = true; return { status: 201, json: {} }; }
    if (p.includes('/git/refs/heads/') && method === 'PATCH') { state.refUpdated = { path: p, sha: opts.body.sha }; return { status: 200, json: {} }; }
    if (p.includes('/git/ref/heads/claudinite/maintenance')) return maintExists ? { status: 200, json: { object: { sha: 'maint-sha' } } } : { status: 404, json: {} };
    if (p.includes(`/git/ref/heads/${defaultBranch}`)) return { status: 200, json: { object: { sha: 'base-sha' } } };
    if (p.includes('/git/blobs') && method === 'POST') { state.blobs.push(opts.body); return { status: 201, json: { sha: `blob-${state.blobs.length}` } }; }
    if (p.includes('/git/commits/')) return { status: 200, json: { tree: { sha: 'base-tree' } } };
    if (p.endsWith('/git/trees') && method === 'POST') { state.trees.push(opts.body); return { status: 201, json: { sha: 'new-tree' } }; }
    if (p.endsWith('/git/commits') && method === 'POST') { state.commits.push(opts.body); return { status: 201, json: { sha: 'new-commit' } }; }
    if (p.endsWith('/pulls') && method === 'GET') return { status: 200, json: [] };
    if (p.endsWith('/pulls') && method === 'POST') { state.prCreated = true; return { status: 201, json: {} }; }
    if (p.endsWith('/issues') && method === 'POST') { state.issueCreated = true; return { status: 201, json: {} }; }
    return { status: 404, json: {} };
  };
  return { gh, state };
}

test('applyToRepo (push): one commit on the default branch, the migration id returned', async () => {
  const { gh, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' } });
  const { ids } = await applyToRepo(gh, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.equal(state.commits.length, 1, 'exactly one commit for the whole set');
  assert.match(state.refUpdated.path, /\/git\/refs\/heads\/main$/);
  assert.equal(state.branchCreated, false);
  assert.equal(state.prCreated, false);
  // the blob carries the rewritten content
  assert.equal(Buffer.from(state.blobs[0].content, 'base64').toString('utf8'), 'uses: ./x\n');
});

test('applyToRepo (pr): creates the maintenance branch + PR, commits there', async () => {
  const { gh, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'pr' });
  const { ids } = await applyToRepo(gh, 'o/r', [rwMig]);
  assert.deepEqual(ids, ['rw']);
  assert.equal(state.branchCreated, true);
  assert.match(state.refUpdated.path, /\/git\/refs\/heads\/claudinite\/maintenance$/);
  assert.equal(state.prCreated, true);
});

test('applyToRepo: a member already on the canonical shape is a no-op (no commit)', async () => {
  const { gh, state } = memberMock({ files: { '.github/w.yml': 'uses: ./x\n' } });
  const { ids } = await applyToRepo(gh, 'o/r', [rwMig]);
  assert.deepEqual(ids, []);
  assert.equal(state.commits.length, 0);
  assert.equal(state.refUpdated, null);
});

test('applyToRepo: an unrecognized delivery opens an issue and applies nothing', async () => {
  const { gh, state } = memberMock({ files: { '.github/w.yml': 'uses: X@main\n' }, delivery: 'weird' });
  const { ids, note } = await applyToRepo(gh, 'o/r', [rwMig]);
  assert.deepEqual(ids, []);
  assert.equal(state.issueCreated, true);
  assert.equal(state.commits.length, 0);
  assert.match(note, /unrecognized delivery/);
});
