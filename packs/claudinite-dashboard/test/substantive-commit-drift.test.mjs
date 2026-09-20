import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubstantiveCommit, HOUSEKEEPING } from '../src/derive/substantive-commit.mjs';
import * as queue from '../../claudinite-tasks/src/signals/substantive-commit.mjs';

// THE DRIFT GUARD for `src/derive/substantive-commit.mjs`, the dashboard's own copy of
// the queue's test. The split is forced — packs share no code — so both copies are run
// over the same commits, in both directions: a commit the page calls project work while
// the member's own precondition calls machinery marks a member sleepy on the very
// commits its scheduler counts as movement.

const commit = (message, login = 'someone') => ({ author: { login }, commit: { message } });
const COMMITS = [
  commit('Add the thing'), commit('Add the thing', 'dependabot[bot]'), commit('chore [skip ci]'),
  commit('Baseline the repo'), commit('  baselining\n'), commit('claudinite-maintenance: converge'),
  commit('[claudinite-work] basics/x'), commit('seed default-on packs'),
  commit('Regenerate\n\nClaudinite-Task: basics/ci-performance\n'), commit('Claudinite-Task:basics/x'),
  commit('Claudinite-Task: '), { message: 'flat shape', author: 'me' }, {}, null,
];
const FILES = [null, [], ['.claudinite/local/x.md'], ['.claudinite/a', 'src/b'], ['src/b']];

test('the dashboard classifies every commit exactly as the queue does', () => {
  const diffs = [];
  for (const c of COMMITS) for (const files of FILES) {
    const a = isSubstantiveCommit(c, files);
    const b = queue.isSubstantiveCommit(c, files);
    if (a !== b) diffs.push(`${JSON.stringify(c)} / ${JSON.stringify(files)}: page ${a} queue ${b}`);
  }
  assert.deepEqual(diffs, []);
  assert.equal(String(HOUSEKEEPING), String(queue.HOUSEKEEPING));
});
