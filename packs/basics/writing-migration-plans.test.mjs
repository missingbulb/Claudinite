// The writing-migration-plans skill. Its whole contract is prose — a plan is an
// issue, and no check can read one — so what is pinned here is the part a session
// silently drops under time pressure: that the plan's shape is *setup, one
// approval of everything, then a chain that runs itself*, rather than a phase list
// with "later" in it.
//
// The failure this guards is the one the corpus already names from two directions
// — a cleanup phase that falls due after the run that would have done it ended
// (RULES' *Planning a migration*), and a step that closes on a human's memory
// (RULES' *When verifying now is genuinely impossible*). The skill is where those
// become an ordering; these tests are what stop the ordering being edited back
// into a checklist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(here, 'skills/writing-migration-plans/SKILL.md'), 'utf8');

test('all the code is written before the one approval — the cleanup included', () => {
  assert.match(skill, /Write \*\*all\*\* the code first/,
    'without this the stack is only the phases before the first gate, and the tail is a "later" nobody does');
  assert.match(skill, /including the cleanup and the destructive tail/i,
    'the cleanup is exactly the code a plan leaves unwritten, and it is the code nothing brings back');
  // WRITE is not MERGE. The distinction is the whole reason the tail can be
  // approved early without being applied early.
  assert.match(skill, /\*Write\* is not \*merge\*/,
    'a reader takes "write it now" as "merge it now" unless the two are separated in words');
});

test('every execution step is a filed link, armed on the one before it', () => {
  assert.match(skill, /## The chain/, 'the mechanism has no home in the skill');
  assert.match(skill, /`Blocked-by:`/,
    'the queue releases a blocked item when its blocker closes — that IS the wiring, and it must be named');
  assert.match(skill, /File the whole chain when the plan is agreed/i,
    'a chain each run files as it goes breaks silently the first time a run parks');
  // The load-bearing half: the chain advances on the previous step being VERIFIED,
  // not on it having run. A link armed on "the run happened" carries a failure
  // forward as if it were a success.
  assert.match(skill, /advances on \*validation\*, not on the step having run/,
    'nothing says what the chain advances on, which is the difference between a chain and a queue of hopes');
});

test('the hazards of closing-as-trigger are stated, since the queue reads nothing else', () => {
  // `readiness.mjs` releases on `closed` and nothing anywhere reads the state
  // reason — so tidying a link away releases its successor into a world that is
  // not ready, and a failed link must therefore stay open.
  assert.match(skill, /nothing distinguishes a `completed` close from a `not planned`/i,
    'the one way a chain misfires is a close that meant "abandon" and read as "proceed"');
  assert.match(skill, /a failed step must not close/i,
    'without this a link comments its failure and closes anyway, releasing the next');
  assert.match(skill, /must park, not guess/i,
    'a scope-blocked sweep answers "all clear" exactly as a healthy fleet does');
});

test('the review checklist looks for the note that should have been a link', () => {
  assert.match(skill, /written as a note rather than filed as a link/i,
    'the commonest defect in a plan is a step phrased "then, once X, do Y" with nothing that comes back when X');
  assert.match(skill, /Code left unwritten because its phase is "later"/i,
    'a reviewer with no line for this reads a four-phase plan as well-sorted');
});

test('the plan and the queue stay one thing read two ways', () => {
  assert.match(skill, /Every execution phase names its link/i,
    'a plan whose checkboxes do not name their issues is a second list that can disagree with the first');
});
