// The verify-in-production skill (#1091) rides the request lane — the queue is the
// delayed-execution mechanism, so the skill's whole contract is prose. These pin
// the parts the machinery depends on; the Not-before adoption carry it leans on is
// engine behaviour, tested in packs/claudinite-tasks/test/queue/request-mode.test.mjs.
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

// The verification is AUTOMATIC end to end: the filed check must be one the run can
// read from HERE, and a person is a rare exception rather than the fallback.
//
// Which reads those are is the half that was missing (#1500): "an unattended run can
// make" is a property a filer will assume of anything it can read ITSELF, and five of
// one batch's seven claimed items parked on a dashboard or a cross-repo read nobody
// had checked the runner could reach. The half after that (#1520): an unreadable
// artifact must READ AS A REASON NOT TO FILE, not as a routing decision — three items
// naming a member repo were filed against a queue whose sessions are scoped to this
// one, and parked minutes after being picked.
test('the check is automatic by construction, and a human is the last resort', () => {
  assert.match(skill, /which tool call the run makes/i,
    'nothing makes the filer test Verify: against a read the runner can actually make');
  assert.match(skill, /file\s+nothing\*\*/i,
    'an unreadable artifact still reads as a form to file rather than a reason to stop');
  assert.match(skill, /rare exception/i,
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

// A RETRY RE-ARMS FROM NOW (#1456). The scheduler releases a sleeping item on the
// first hourly pass past its `Not-before`, and a busy queue adds more delay — so the
// old value is already in the past when the run reads it. Pushing THAT forward by
// `Retry-every: 1 day` can land in the past again, which re-adopts the item on the
// very next pass and spends a session an hour instead of a day. #1160 sat on a
// `Not-before` five days stale.
test('the re-arm is computed from now, not from the stale Not-before', () => {
  assert.match(skill, /now \+ `Retry-every:`/,
    'the playbook never says what the new instant is measured from');
  assert.match(skill, /never the old value/i,
    'nothing rules out old-value + Retry-every, the reading that re-fires every pass');
});

// THE PARAMETERS LEAD THE BODY (#1456). Every field the scheduler run and the
// executor read is one block on the first lines, so a person can see what the run
// will do without hunting, and a retry rewriting `Not-before` has one place to write.
test('the execution parameters are one block on the body first lines', () => {
  assert.match(skill, /first lines/i,
    'nothing places the parameter block, so filers scatter the fields through the prose');
  const template = /```\n(Original-issue:[\s\S]*?)```/.exec(skill)?.[1] ?? '';
  assert.match(template, /^Model:/m,
    'Model: is prescribed away from the other parameters — the scattering #1160 shows');
});
