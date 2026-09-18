import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closesIssueIn } from '../src/read/pr-fields.mjs';
import { closesIssueIn as queueCloses } from '../../claudinite-tasks/src/items/pr-fields.mjs';

// THE DRIFT GUARD for `src/read/pr-fields.mjs`, the dashboard's own copy of the queue's
// closing-issue parse. The split is forced — packs share no code — so both copies are run
// over the same bodies, in both directions: the fold and the page must file one PR
// under one issue.

const BODIES = [
  null, '', 'Closes #12', 'closes #12\nFixes #13', 'Refs #12', '  Resolves #7', 'x Closes #3', 'Closes#3',
  'Closes #0', 'Closes #12abc', 'body\n\nfixes #99 and more', 'FIXES #4', 'Closes #12\r\n',
];

test('the dashboard finds the closing issue exactly as the queue does', () => {
  const diffs = BODIES.filter((b) => closesIssueIn(b) !== queueCloses(b)).map((b) => JSON.stringify(b));
  assert.deepEqual(diffs, []);
});
