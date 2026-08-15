import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staleReadyItems, deadAgentItems, stuckBlockedItems, statelessItems, periodForTasks,
} from '../../../engine/scheduler/queue/janitor-rules.mjs';

let seq = 900;
const it = ({ task = 'a', labels, created_at = '2026-08-10T04:00:00Z', updated_at = created_at, body = 'p/t.md\n' }) => ({
  number: seq += 1, title: `[claudinite-work] p/${task}`, labels, state: 'open', body, created_at, updated_at,
});

const NOW = '2026-08-14T04:00:00Z';

test('the stale-ready escalation counts the task\'s OWN declared period', () => {
  const periodFor = periodForTasks([
    { pack: 'p', id: 'hourlyish', decl: { frequency: 'hourly' } },
    { pack: 'p', id: 'weeklyish', decl: { frequency: 'weekly' } },
  ]);
  const hourly = it({ task: 'hourlyish', labels: ['task:ready'], updated_at: '2026-08-14T01:00:00Z' });
  const weekly = it({ task: 'weeklyish', labels: ['task:ready'], updated_at: '2026-08-14T01:00:00Z' });
  // Three hours: past two hourly periods, nowhere near two weekly ones.
  assert.deepEqual(staleReadyItems([hourly, weekly], NOW, { periodFor }).map((i) => i.number), [hourly.number]);
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
