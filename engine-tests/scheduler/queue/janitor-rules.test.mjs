import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staleReadyItems, deadAgentItems, stuckBlockedItems, statelessItems, periodForTasks,
} from '../../../engine/scheduler/queue/janitor-rules.mjs';
import { periodMs } from '../../../engine/scheduler/queue/anchors.mjs';
import { ACCEPTED_FREQUENCIES } from '../../../engine/scheduler/calendar.mjs';

let seq = 900;
const it = ({ task = 'a', labels, created_at = '2026-08-10T04:00:00Z', updated_at = created_at, body = 'p/t.md\n' }) => ({
  number: seq += 1, title: `[claudinite-work] p/${task}`, labels, state: 'open', body, created_at, updated_at,
});

const NOW = '2026-08-14T04:00:00Z';

test('the stale-ready escalation counts the task\'s OWN declared period', () => {
  const periodFor = periodForTasks([
    { pack: 'p', id: 'dailyish', decl: { frequency: 'daily' } },
    { pack: 'p', id: 'weeklyish', decl: { frequency: 'weekly' } },
  ]);
  const daily = it({ task: 'dailyish', labels: ['task:ready'], updated_at: '2026-08-11T01:00:00Z' });
  const weekly = it({ task: 'weeklyish', labels: ['task:ready'], updated_at: '2026-08-11T01:00:00Z' });
  // Three days: past two daily periods, nowhere near two weekly ones.
  assert.deepEqual(staleReadyItems([daily, weekly], NOW, { periodFor }).map((i) => i.number), [daily.number]);
});

// The retired `hourly` spelling reads as `daily` at the door (DESIGN §17.1), and this rule is
// exactly why the normalization cannot live in the calendar alone: judged on its raw token, a
// member's un-converged `hourly` task would be called stale after two HOURS and parked
// needs-human on every sweep — on precisely the members the tolerance exists to protect.
test('a retired `hourly` declaration is judged on a DAY, not an hour', () => {
  const periodFor = periodForTasks([{ pack: 'p', id: 'legacy', decl: { frequency: 'hourly' } }]);
  const threeHours = it({ task: 'legacy', labels: ['task:ready'], updated_at: '2026-08-14T01:00:00Z' });
  assert.deepEqual(staleReadyItems([threeHours], NOW, { periodFor }), [], 'three hours is not stale');

  const threeDays = it({ task: 'legacy', labels: ['task:ready'], updated_at: '2026-08-11T01:00:00Z' });
  assert.deepEqual(staleReadyItems([threeDays], NOW, { periodFor }).map((i) => i.number), [threeDays.number],
    'three days is — the same bound a `daily` task gets');
});

test('an item already in triage is never re-escalated — convergence, not re-announcement', () => {
  const escalated = it({ labels: ['task:ready', 'needs-human'], updated_at: '2026-08-01T00:00:00Z' });
  assert.deepEqual(staleReadyItems([escalated], NOW), []);
});

test('the agent leash converges a session that went silent, and spares a live one', () => {
  const dead = it({ labels: ['task:agent'], updated_at: '2026-08-14T00:00:00Z' });
  const live = it({ labels: ['task:agent'], updated_at: '2026-08-14T03:30:00Z' });
  assert.deepEqual(deadAgentItems([dead, live], NOW).map((i) => i.number), [dead.number]);
});

// F14 — the stale-ready rule cannot see this at all: a blocked item is never
// ready, so a dependency that never resolves had no rule watching it.
test('a blocked item whose blockers never resolve is surfaced; a sleeping one is not (F14)', () => {
  const stuck = it({ labels: ['task:blocked'], created_at: '2026-08-01T00:00:00Z', body: 'p/t.md\n\nBlocked-by: #10\n' });
  const settled = it({ labels: ['task:blocked'], created_at: '2026-08-01T00:00:00Z', body: 'p/t.md\n\nBlocked-by: #11\n' });
  const sleeping = it({ labels: ['task:blocked'], created_at: '2026-08-01T00:00:00Z', body: 'p/t.md\n\nNot-before: 2026-09-01T04:00:00Z\n' });
  const stateOf = (n) => (n === 11 ? 'closed' : 'open');
  assert.deepEqual(stuckBlockedItems([stuck, settled, sleeping], NOW, { stateOf }).map((i) => i.number), [stuck.number]);
});

test('a rolling item is never stuck — waiting for its own next anchor is the mechanism working', () => {
  const rolling = it({ labels: ['task:blocked'], created_at: '2026-06-01T00:00:00Z', body: 'p/t.md\n\nNot-before: 2026-08-15T04:00:00Z\n' });
  assert.deepEqual(stuckBlockedItems([rolling], NOW), []);
});

// §6.2 — a torn label swap leaves an open item outside the state machine, and
// every rule that filters by state is blind to it.
test('an open item wearing no state label at all is repaired to triage', () => {
  const torn = it({ labels: ['origin:schedule'] });
  const fine = it({ labels: ['origin:schedule', 'task:blocked'] });
  const triaged = it({ labels: ['needs-human'] });
  assert.deepEqual(statelessItems([torn, fine, triaged]).map((i) => i.number), [torn.number]);
});


// The whole accepted vocabulary yields a period the stale bounds can count in — the contract,
// rather than any one line of `periodMs`. A retired spelling must never resolve finer than the
// canonical token it stands for, which is what would park an un-converged member's task.
test('every accepted frequency has a sane period, retired spellings included', () => {
  const DAY = 86_400_000;
  for (const f of ACCEPTED_FREQUENCIES) {
    const p = periodMs(f);
    if (f === 'manual') { assert.equal(p, null, 'manual has no period'); continue; }
    assert.ok(typeof p === 'number' && p >= DAY, `${f} is at least a day, got ${p}`);
  }
  assert.equal(periodMs('hourly'), periodMs('daily'));
  assert.equal(periodMs('daily-2h'), periodMs('daily'));
  assert.equal(periodMs('weekly'), 7 * DAY);
});
