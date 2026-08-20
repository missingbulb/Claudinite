// The verify-in-production skill (#1091) rides the request lane — the queue is the
// delayed-execution mechanism, so the skill's whole contract is prose. These pin
// the parts the machinery depends on; the Not-before adoption carry it leans on is
// engine behaviour, tested in engine-tests/scheduler/queue/request-mode.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'skills/verify-in-production/SKILL.md'), 'utf8');

test('the skill carries the discernment test — most changes file nothing', () => {
  assert.match(skill, /file nothing/i,
    'the skill never says which changes file nothing, so every change would file one');
});

test('what it files is a request the queue adopts, not a mechanism beside it', () => {
  assert.match(skill, /`claude-task`/, 'the mark is what makes the tick adopt the issue');
  assert.match(skill, /Blocked-by:/, 'without the PR blocker the run races the merge');
  assert.match(skill, /Not-before:/, 'without the delay the run fires before the release it waits on');
  assert.doesNotMatch(skill, /claude-automerge.*apply/i, 'a verification has nothing to merge');
});

// Not-live-yet must re-arm silently: the re-mark is consumed at adoption, so the
// bumped Not-before is the whole record, and a comment per retry would turn a
// change waiting on a nightly converge into a week of notifications.
test('a not-yet-live run re-arms by field and mark, bounded by a give-up date', () => {
  assert.match(skill, /re-apply\s+`claude-task`/i);
  assert.match(skill, /Give-up-after:/);
  assert.match(skill, /No comment/i);
});
