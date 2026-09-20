import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubstantiveCommit } from '../../src/signals/substantive-commit.mjs';

// The one test for "did the project move, or was that the machinery" — published
// because a cross-repo reader (the dashboard's sleepy mark) must classify a member's
// commits exactly as that member's own preconditions do.

const commit = (over = {}) => ({ commit: { message: 'Add a feature' }, author: { login: 'a-person' }, ...over });

test('genuine project work is substantive', () => {
  assert.equal(isSubstantiveCommit(commit(), ['src/app.js']), true);
});

test('a bot, a housekeeping message and a task trailer are all machinery', () => {
  assert.equal(isSubstantiveCommit(commit({ author: { login: 'github-actions[bot]' } }), ['src/a.js']), false);
  assert.equal(isSubstantiveCommit(commit({ commit: { message: 'Claudinite baselining' } }), ['src/a.js']), false);
  assert.equal(isSubstantiveCommit(commit({ commit: { message: 'Fold usage\n\nClaudinite-Task: basics/usage-fold\n' } }), ['src/a.js']), false);
});

test('a corpus-only commit is machinery where the file list was read', () => {
  assert.equal(isSubstantiveCommit(commit(), ['.claudinite/shared/engine/x.mjs']), false);
  assert.equal(isSubstantiveCommit(commit(), ['.claudinite/local/packs/p/RULES.md', 'src/a.js']), true);
});

// The reader that cannot afford a request per commit passes no file list at all. It
// must get the other three exclusions rather than a refusal — and a corpus-only commit
// then counts as work, which is the gap that reader states for itself.
test('with no file list the corpus-only exclusion simply does not run', () => {
  assert.equal(isSubstantiveCommit(commit()), true);
  assert.equal(isSubstantiveCommit(commit(), null), true);
  assert.equal(isSubstantiveCommit(commit({ author: { login: 'x[bot]' } }), null), false);
});

test('an empty file list is unknown, not "touched only the corpus"', () => {
  assert.equal(isSubstantiveCommit(commit(), []), true);
});

test('the listing shape — a flat author login and message — classifies identically', () => {
  assert.equal(isSubstantiveCommit({ message: 'Add a feature', author: 'a-person' }), true);
  assert.equal(isSubstantiveCommit({ message: 'Add a feature', author: 'x[bot]' }), false);
});
