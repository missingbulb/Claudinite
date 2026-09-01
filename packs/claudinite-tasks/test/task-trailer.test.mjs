import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASK_TRAILER, taskTrailer, withTaskTrailer, taskFromMessage } from '../task-trailer.mjs';

// The trailer every delivery lane stamps, and the reader the movement signals
// classify by (task-preconditions DESIGN, "Classifying task output structurally").

test('the trailer round-trips: what a lane stamps is what a collector reads back', () => {
  const stamped = withTaskTrailer('Regenerate the aggregate\n\nRefs #12', 'claudinite-tasks/usage-fold');
  assert.match(stamped, /^Claudinite-Task: claudinite-tasks\/usage-fold$/m);
  assert.equal(taskFromMessage(stamped), 'claudinite-tasks/usage-fold');
  assert.match(stamped, /Refs #12/, 'the message it was given survives');
});

test('a writer with no task to name stamps nothing, and interpolates cleanly', () => {
  // A hand-run worker or a member's own script: the older author/title exclusions
  // classify it exactly as they always did.
  assert.equal(taskTrailer(null), '');
  assert.equal(withTaskTrailer('Some work', null), 'Some work');
  assert.equal(taskFromMessage('Some work'), null);
});

test('the trailer is never doubled — the lanes compose', () => {
  // A worker's own message, then the merge commit built from it: two stamps would
  // read as two tasks.
  const once = withTaskTrailer('Sweep', 'tidy-repo/improve-comments');
  assert.equal(withTaskTrailer(once, 'tidy-repo/improve-comments'), once);
  assert.equal(once.split(TASK_TRAILER).length - 1, 1);
});

test('the trailer must be its own line — a mention in prose is not a stamp', () => {
  assert.equal(taskFromMessage('Explain why Claudinite-Task: a/b is stamped by the lanes and not by hand'), null);
});
