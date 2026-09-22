import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTaskDeclaration, normalizeTaskDeclaration, isScheduledTask, TRIGGERS,
  TRIGGER_SCHEDULE, TRIGGER_REQUEST,
} from '../../src/contract/task-contract.mjs';

// The declaration says who mints an occurrence, and `preconditions` says only what
// must hold once one exists (#1725). The two were one field for a window, read off
// the shape of the expression; every case below is a pair the shape could not tell
// apart.
const base = {
  id: 'acme-task-h',
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

// The derivation that read the trigger off the shape of the expression is gone
// (#1789): every shape it used to answer for is now a declaration the engine refuses
// rather than one it guesses at, which is what makes `trigger` data a reader can audit.
test('a declaration stating no trigger is rejected, never read off the shape of its conditions', () => {
  // The two shapes the derivation told apart: conditions the scheduler could judge,
  // and none at all. Neither answers now.
  for (const preconditions of [['due:daily'], ['about-this-issue'], []]) {
    assert.equal(declare({ preconditions }).trigger, undefined, JSON.stringify(preconditions));
    assert.match(validateTaskDeclaration({ ...base, preconditions })[0].what, /declares no "trigger"/);
  }
  assert.match(validateTaskDeclaration(base)[0].what, /declares no "trigger"/, 'nor does stating no conditions either');
});

// The `frequency` field is retired (#1732). It never spoke for the trigger either, so
// a declaration carrying it is rejected for the field and still has to state its own.
test('the retired frequency field is rejected, and still answers nothing about the trigger', () => {
  assert.deepEqual(declare({ frequency: 'weekly' }).preconditions, []);
  assert.equal(declare({ frequency: 'weekly' }).trigger, undefined);
  const whats = validateTaskDeclaration({ ...base, frequency: 'weekly' }).map((p) => p.what).join(' | ');
  assert.match(whats, /declares no "trigger"/);
  assert.match(whats, /"frequency", which is retired/);
  // Stating the trigger does not rescue the field: it is retired whatever stands beside it.
  assert.match(
    validateTaskDeclaration({ ...base, frequency: 'weekly', trigger: TRIGGER_SCHEDULE }).map((p) => p.what).join(' | '),
    /"frequency", which is retired/,
  );
});

test('validateTaskDeclaration rejects a trigger outside the vocabulary', () => {
  assert.deepEqual(validateTaskDeclaration({ ...base, trigger: TRIGGER_SCHEDULE, preconditions: ['due:daily'] }), []);
  const bad = validateTaskDeclaration({ ...base, trigger: 'cron' });
  assert.match(bad[0].what, /not a legal trigger/);
  assert.match(bad[0].fix, /schedule/);
});
