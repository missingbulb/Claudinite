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
  join(dirname(fileURLToPath(import.meta.url)), '../skills/verify-in-production/SKILL.md'), 'utf8');

test('the skill carries the discernment test — most changes file nothing', () => {
  assert.match(skill, /file nothing/i,
    'the skill never says which changes file nothing, so every change would file one');
});

test('what it files is a request the queue adopts, not a mechanism beside it', () => {
  assert.match(skill, /`task:origin:ad-hoc`/, 'the mark is what makes the scheduler run adopt the issue');
  assert.match(skill, /Not-before:/, 'without the delay the run fires before the release it waits on');
  assert.doesNotMatch(skill, /Automerge:.*apply/i, 'a verification has nothing to merge');
});

// FILED ONLY AFTER THE MERGE (#1128). A PR can be REJECTED, and the queue cannot tell
// that from a merge: `readiness.mjs` releases a blocked item when its blocker is
// `closed`, and nothing anywhere reads `merged`. A verification filed pre-merge against
// a PR that is then rejected reads an `In-production-when:` that can never come true,
// re-arms silently by `Retry-every:` forever, and no janitor rule reclaims it — rule A
// cannot see an item sleeping on a future `Not-before`, and rule C exempts one whose
// blockers have closed. So the trigger moves to the merge and the field that
// accommodated the early file goes away.
test('the brief is filed only after the merge, and carries no PR blocker', () => {
  assert.match(skill, /after the merge, never before/i,
    'nothing stops a session filing this the moment the PR opens');
  assert.match(skill, /rejected/i,
    'the skill never says a rejected PR is why filing early is wrong');
  assert.doesNotMatch(skill, /^Blocked-by:/m,
    'the template still tells the filer to block on the PR — the field that invited the premature file');
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

// The hierarchy, not just the field: a verification hangs under the change it
// proves, so the original issue shows what is still unproven about it.
test('the verification is filed as a sub-issue of the original', () => {
  assert.match(skill, /sub-issue/i, 'the skill never links the verification under the change it proves');
  assert.match(skill, /sub_issue_write/, 'nothing says how to make the link');
});

// Not-live-yet re-arms silently, by the extension the FILER stated — the run just
// executes its playbook, deciding nothing.
test('a not-yet-live run re-arms by the filed Retry-every, mark and field only', () => {
  assert.match(skill, /Retry-every:/);
  assert.match(skill, /clear the issue's\s+`task:status:\*` label/i);
  assert.match(skill, /No comment/i);
  assert.doesNotMatch(skill, /Give-up-after/, 'the give-up marker was dropped (owner, 2026-08-20)');
  assert.doesNotMatch(skill, /sensible/i, 'the run decides nothing — the filer stated the extension');
});
