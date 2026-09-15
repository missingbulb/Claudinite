// The fold's own gate: it runs when the machinery has moved since the last fold,
// and the only free evidence of that is the file's own watermark.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { terms } from '../../../tasks/tasks-usage-fold/preconditions.mjs';
import {
  TASKS_USAGE_PATH, encodeTasksUsageFile, renderTasksUsageFile,
} from '../../../src/items/tasks-usage-format.mjs';

const SCHEDULE = { dailyHour: 5, weeklyDay: 'Sun', monthlyDay: 1 };
const NOW = new Date('2026-09-15T12:00:00Z');   // today's 05:00 anchor has passed

// A checkout carrying a file whose run watermark is `mark`, or no file at all.
function checkout(mark) {
  const root = mkdtempSync(join(tmpdir(), 'tasks-usage-'));
  if (mark !== undefined) {
    const path = join(root, TASKS_USAGE_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderTasksUsageFile(encodeTasksUsageFile({ runsFoldedThrough: mark })));
  }
  return root;
}

const judge = (root) => {
  const before = process.env.CLAUDINITE_REPO_ROOT;
  process.env.CLAUDINITE_REPO_ROOT = root;
  try { return terms['runs-since-fold'].holds({}, { now: NOW, schedule: SCHEDULE }); }
  finally {
    if (before === undefined) delete process.env.CLAUDINITE_REPO_ROOT;
    else process.env.CLAUDINITE_REPO_ROOT = before;
  }
};

test('a repo that has never folded runs — everything its machinery did is uncounted', () => {
  assert.equal(judge(checkout(undefined)).holds, true);
});

test('a mark still standing before the most recent anchor means the machinery has run since', () => {
  assert.equal(judge(checkout('2026-09-14T17:10:00Z')).holds, true);
});

test('a mark past the most recent anchor declines — nothing has run since the last fold', () => {
  // The gate flips false the moment a fold catches up, which is what keeps this a
  // reading of the mark's own movement rather than standing state.
  assert.equal(judge(checkout('2026-09-15T06:00:00Z')).holds, false);
});

test('an unreadable or malformed file reads as never folded rather than as caught up', () => {
  const root = checkout(undefined);
  const path = join(root, TASKS_USAGE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'not json at all');
  assert.equal(judge(root).holds, true);
});
