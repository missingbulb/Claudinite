// The follow-up that comes back on its own when a change can only be proven in
// production (#1091): the skill that files the verification, and the task that
// picks it up once the change is actually live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import task from '../../packs/basics/tasks/verify-in-production/task.mjs';
import { VERIFY_TITLE_PREFIX } from '../../packs/basics/tasks/verify-in-production/marker.mjs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/basics');
const TASK_DIR = join(PACK_DIR, 'tasks/verify-in-production');

const S = (open = []) => ({ issues: { open, touched: [] } });
const issue = (number, title) => ({ number, title, updatedAt: '2026-08-20T00:00:00Z', labels: [] });

test('the task declares the full contract and writes issues only', () => {
  assert.equal(task.id, 'verify-in-production');
  assert.equal(task.expected_outcome, 'none');   // a failed verification is filed, never fixed here
  assert.deepEqual(task.precondition_signals, ['issues']);
  assert.ok(existsSync(join(TASK_DIR, task.agent_instructions)));
});

test('an open verification issue is the whole trigger, and the scope', () => {
  const v = task.precondition(S([
    issue(7, `${VERIFY_TITLE_PREFIX} the checkbox rule closes a real issue`),
    issue(9, 'an ordinary issue nobody filed for this'),
  ]));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /#7/);
  assert.doesNotMatch(v.context.join(' '), /#9/);
});

test('no verification issue open, no run — the queue is empty and empties itself', () => {
  assert.equal(task.precondition(S()).run, false);
  assert.equal(task.precondition(S([issue(9, 'an ordinary issue')])).run, false);
});

// The marker is a TITLE prefix rather than a label: the filing session must be able
// to mark an issue on a repo where nothing has created a label yet, and GitHub 422s
// an unknown one.
test('the marker prefix is shared by the filer and the reader, and survives the signal filter', () => {
  const skill = readFileSync(join(PACK_DIR, 'skills/verify-in-production/SKILL.md'), 'utf8');
  assert.ok(skill.includes(VERIFY_TITLE_PREFIX), 'the skill does not tell the filer the exact title prefix the task reads');
  // The issues collector hides the queue's own items and the standing trackers.
  assert.doesNotMatch(VERIFY_TITLE_PREFIX, /^\[claudinite-(task|work)\]/);
  assert.doesNotMatch(VERIFY_TITLE_PREFIX, /^(claudinite tracker:|auto-improvements tracker\b|repo tidy tracker$)/i);
});

test('the skill carries the discernment test — most changes file nothing', () => {
  const skill = readFileSync(join(PACK_DIR, 'skills/verify-in-production/SKILL.md'), 'utf8');
  assert.match(skill, /file nothing/i, 'the skill never says which changes file nothing, so every change would file one');
});

// Not-live-yet must be silent. A comment per run turns a change waiting on a
// nightly converge into a dozen notifications, which is what the tidy sweep's
// no-repeat rule was written for.
test('the worker keeps a not-yet-live issue silent, and gives up on a stated date', () => {
  const worker = readFileSync(join(TASK_DIR, task.agent_instructions), 'utf8');
  assert.match(worker, /not yet live/i);
  assert.match(worker, /Give-up-after/);
});
