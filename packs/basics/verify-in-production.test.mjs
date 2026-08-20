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

// The verification is AUTOMATIC end to end: the filed check must be one an
// unattended run can read, and a person enters only where no such read exists.
test('the check is automatic by construction, and a human is the last resort', () => {
  assert.match(skill, /unattended[\s*]+run can make/i,
    'nothing requires Verify: to be automatically checkable');
  assert.match(skill, /no automatic check/i,
    'the skill never bounds when a person may be asked at all');
});

// A failed verification routes back to the ORIGINAL issue — reopened, with the
// status commented — so the filer's brief must carry that issue's number.
test('a failing run reopens the original issue the filed brief names', () => {
  assert.match(skill, /Original-issue:/);
  assert.match(skill, /reopen/i);
});

// Not-live-yet re-arms silently, by the extension the FILER stated — the run just
// executes its playbook, deciding nothing.
test('a not-yet-live run re-arms by the filed Retry-every, mark and field only', () => {
  assert.match(skill, /Retry-every:/);
  assert.match(skill, /re-apply\s+`claude-task`/i);
  assert.match(skill, /No comment/i);
  assert.doesNotMatch(skill, /Give-up-after/, 'the give-up marker was dropped (owner, 2026-08-20)');
  assert.doesNotMatch(skill, /sensible/i, 'the run decides nothing — the filer stated the extension');
});
