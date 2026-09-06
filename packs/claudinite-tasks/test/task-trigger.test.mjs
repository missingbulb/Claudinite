import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTaskDeclaration, normalizeTaskDeclaration, isScheduledTask, TRIGGERS,
  TRIGGER_SCHEDULE, TRIGGER_REQUEST,
} from '../task-contract.mjs';

// The declaration says who mints an occurrence, and `preconditions` says only what
// must hold once one exists (#1725). The two were one field for a window, read off
// the shape of the expression; every case below is a pair the shape could not tell
// apart.
const base = {
  id: 'growth-extract',
  description: 'Extract lessons from the window.',
  expected_outcome: 'no_code_changes',
  agent_model: 'none',
  code_work: 'node worker.mjs',
  code_work_timeout: 600,
};

const declare = (extra) => normalizeTaskDeclaration({ ...base, ...extra });

test('the vocabulary is the two triggers, and isScheduledTask reads the field', () => {
  assert.deepEqual(TRIGGERS, [TRIGGER_SCHEDULE, TRIGGER_REQUEST]);
  assert.equal(isScheduledTask(declare({ trigger: TRIGGER_SCHEDULE, preconditions: ['due:weekly'] })), true);
  assert.equal(isScheduledTask(declare({ trigger: TRIGGER_REQUEST, preconditions: [] })), false);
});

test('a stated trigger beats what the expression looks like, in both directions', () => {
  // Conditions the scheduler could judge, and the task is still off the schedule.
  assert.equal(isScheduledTask(declare({ trigger: TRIGGER_REQUEST, preconditions: ['due:weekly', 'substantive-change'] })), false);
  // No conditions at all, and the task is still asked at every tick.
  assert.equal(isScheduledTask(declare({ trigger: TRIGGER_SCHEDULE, preconditions: [] })), true);
});

test('a declaration stating no trigger is read the way the expression was read before the field', () => {
  assert.equal(declare({ preconditions: ['due:daily'] }).trigger, TRIGGER_SCHEDULE);
  assert.equal(declare({ preconditions: [] }).trigger, TRIGGER_REQUEST);
  assert.equal(declare({}).trigger, TRIGGER_REQUEST);
  // A term that reads the item itself: nothing to judge at a tick, so the task is
  // off the schedule — but only where the term RESOLVES. Handed no terms the door
  // cannot know that, and reads the condition as any other, which is what the
  // predicate did before the field and so what a legacy declaration must keep doing.
  const terms = new Map([['about-this-issue', { needsItem: true, signals: [] }]]);
  assert.equal(normalizeTaskDeclaration({ ...base, preconditions: ['about-this-issue'] }, terms).trigger, TRIGGER_REQUEST);
  assert.equal(declare({ preconditions: ['about-this-issue'] }).trigger, TRIGGER_SCHEDULE, 'unresolved, so unknowable');
});

test('the retired frequency field derives the trigger it always meant', () => {
  assert.equal(declare({ frequency: 'weekly' }).trigger, TRIGGER_SCHEDULE);
  assert.equal(declare({ frequency: 'manual' }).trigger, TRIGGER_REQUEST);
});

test('validateTaskDeclaration rejects a trigger outside the vocabulary', () => {
  assert.deepEqual(validateTaskDeclaration({ ...base, trigger: TRIGGER_SCHEDULE, preconditions: ['due:daily'] }), []);
  const bad = validateTaskDeclaration({ ...base, trigger: 'cron' });
  assert.match(bad[0].what, /not a legal trigger/);
  assert.match(bad[0].fix, /schedule/);
});
