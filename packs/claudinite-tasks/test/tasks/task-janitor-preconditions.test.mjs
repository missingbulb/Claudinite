import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terms } from '../../tasks/task-janitor/preconditions.mjs';
import { AGENT_LEASH_MS, STUCK_BLOCKED_MS, TERMINAL_OPEN_MS } from '../../src/recover/janitor-rules.mjs';

// task-janitor's own gate. The janitor is the fallback lane, so the term's whole
// risk is a WRONG DECLINE — a repair nobody is asked to make — and every case here
// is about what it must NOT sleep through.

const NOW_MS = Date.parse('2026-09-20T12:00:00Z');
const NOW = new Date(NOW_MS).toISOString();
const ago = (ms) => new Date(NOW_MS - ms).toISOString();
const HOUR = 3600e3;

const item = (over = {}) => ({
  number: 7, title: '[claudinite-work] p/t', body: 'packs/p/tasks/t/task.md\n', state: 'open',
  labels: ['task:status:waiting-for-executor', 'task:origin:planned'],
  created_at: ago(HOUR), closed_at: null, updated_at: ago(HOUR), ...over,
});
const ask = (open) => terms['queue-needs-sweep'].holds({ queue: { open } }, { now: NOW });

test('a queue where every item is live, statused and inside its clocks declines', () => {
  const verdict = ask([
    item(),
    item({ number: 8, labels: ['task:status:running-agent'], updated_at: ago(HOUR) }),
    item({ number: 9, labels: ['task:status:running-executor'] }),
  ]);
  assert.equal(verdict.holds, false);
  assert.match(verdict.reason, /3 open/, 'the reason says what it looked at, so a wrong decline is readable in the log');
});

test('an empty queue declines — no rule of the janitor has a domain', () => {
  assert.equal(ask([]).holds, false);
});

test('a parked item always holds: four rules read a park, and each needs a read this term does not make', () => {
  for (const park of ['failure', 'action', 'decision', 'approval']) {
    const verdict = ask([item({ labels: [`task:status:needs-human-${park}`] })]);
    assert.equal(verdict.holds, true, `a ${park} park must wake the janitor`);
  }
});

test('an item off the state machine holds — the torn label swap is rule D', () => {
  assert.equal(ask([item({ labels: ['task:origin:planned'] })]).holds, true);
});

test('a terminal status standing open past its bound holds', () => {
  const inFlight = ask([item({ labels: ['task:status:done'], updated_at: ago(TERMINAL_OPEN_MS / 2) })]);
  assert.equal(inFlight.holds, false, 'a converge writes the label and the close seconds apart — that is not torn yet');
  const torn = ask([item({ labels: ['task:status:done'], updated_at: ago(TERMINAL_OPEN_MS * 2) })]);
  assert.equal(torn.holds, true);
});

test('a dead agent claim holds exactly at the leash, not only past it', () => {
  const running = (age) => item({ labels: ['task:status:running-agent'], updated_at: ago(age) });
  assert.equal(ask([running(AGENT_LEASH_MS - 1)]).holds, false);
  assert.equal(ask([running(AGENT_LEASH_MS)]).holds, true, 'the rule claims at >=, and the tick lands ON the boundary as often as either side');
});

test('a blocked item past the stuck bound holds; one whose wait is a time does not', () => {
  const blocked = (over) => item({ labels: ['task:status:blocked'], created_at: ago(STUCK_BLOCKED_MS + HOUR), ...over });
  assert.equal(ask([blocked({ body: 'packs/p/tasks/t/task.md\nBlocked-by: #4\n' })]).holds, true);
  assert.equal(ask([blocked({ body: 'packs/p/tasks/t/task.md\nNot-before: 2026-12-01T00:00:00Z\n' })]).holds, false,
    'waiting for a time is the mechanism working, not a repair');
});

test('a ready item nobody picked for two of its periods holds', () => {
  const ready = (age) => item({ updated_at: ago(age), created_at: ago(age) });
  assert.equal(ask([ready(HOUR * 36)]).holds, false);
  assert.equal(ask([ready(HOUR * 24 * 3)]).holds, true);
});

test('an unreadable queue is an error, never a decline', () => {
  const verdict = terms['queue-needs-sweep'].holds({ queue: { error: 'the work-item list could not be read at page 2 (502)' } }, { now: NOW });
  assert.ok(verdict.error, 'a decline on evidence that was not there stops the recovery lane silently and permanently');
  assert.match(verdict.error, /502/, 'the reason the read failed travels to the failure park');
});
