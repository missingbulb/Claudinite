// What code_work hands the agentic phase, on the queue's dispatch path — the twin of
// dispatch.mjs's `deliveredLines` for the slot path. The two render the same payload
// into different carriers (a work item's section vs a dispatch issue's body), so a key
// added to one and not the other is dropped silently on half the fleet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveredLines, missingSecrets } from '../../../engine/scheduler/queue/code-work-run.mjs';

test('an artifact code_work created is named by identity', () => {
  assert.deepEqual(deliveredLines({ pr: 7, branch: 'claudinite/x' }), [
    'PR: #7 (open)',
    'Branch: `claudinite/x`',
  ]);
  assert.match(deliveredLines({ pr: 7, merged: true })[0], /already merged/);
});

// A task that keeps a standing record resolves it in its OWN code_work and passes the
// number on through this payload. Both live workers were already writing
// `delivered.issue` and nothing rendered it, so the number reached no agent and the
// agentic phase went hunting for the issue by title instead.
test('an ISSUE code_work resolved reaches the agent', () => {
  assert.deepEqual(deliveredLines({ issue: 42 }), ["Issue: #42 — write this run's record there."]);
});

test('absence stays absence — no placeholder for what was not created', () => {
  for (const delivered of [null, undefined, {}, { pr: null, branch: null, issue: null }]) {
    assert.deepEqual(deliveredLines(delivered), [], JSON.stringify(delivered));
  }
});

test('a declared secret that is unset is named; a set-but-empty one is the repo\'s own choice', () => {
  assert.deepEqual(missingSecrets(['A', 'B'], { B: '' }), ['A']);
  assert.deepEqual(missingSecrets([], {}), []);
});
