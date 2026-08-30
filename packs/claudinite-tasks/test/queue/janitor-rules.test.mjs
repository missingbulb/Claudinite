import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staleReadyItems, deadAgentItems, stuckBlockedItems, statelessItems, periodForTasks,
  supersededItems, supersededComment, orphanedParkItems, orphanedParkComment,
} from '../../queue/janitor-rules.mjs';
import { periodMs } from '../../queue/anchors.mjs';
import { ACCEPTED_FREQUENCIES } from '../../calendar.mjs';

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

// ---------------------------------------------------------------------------
// Rule E — the superseded park (#1452).

const parked = ({ task = 'a', kind = 'failure', updated_at = '2026-08-12T04:00:00Z' }) =>
  it({ task, labels: ['needs-human', `task:status:needs-human-${kind}`], updated_at });

const doneRuns = (rows) => (id, after) => {
  const at = new Date(after).getTime();
  const hit = rows.filter((r) => r.id === id && new Date(r.closed_at).getTime() > at)
    .sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at)).at(-1);
  return hit ?? null;
};

test('a failure park whose task later ran clean is superseded', () => {
  const item = parked({ task: 'digest', kind: 'failure' });
  const doneAfter = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([item], { doneAfter }).map((i) => i.number), [item.number]);
});

test('an action park is superseded too — it named a broken thing, and it is fixed', () => {
  const item = parked({ task: 'digest', kind: 'action' });
  const doneAfter = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([item], { doneAfter }).map((i) => i.number), [item.number]);
});

// An approval park usually holds an open PR (ClaudiniteCanary#133 holds PR #134), and a
// decision park holds a question nobody has answered. A later clean run does not answer
// either, so closing them would abandon real work.
test('approval and decision parks are NEVER superseded', () => {
  const doneAfter = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  for (const kind of ['approval', 'decision']) {
    assert.deepEqual(supersededItems([parked({ task: 'digest', kind })], { doneAfter }), [],
      `a ${kind} park must survive a later success`);
  }
});

test('a success at or before the park says nothing about it', () => {
  const item = parked({ task: 'digest', updated_at: '2026-08-12T04:00:00Z' });
  const earlier = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-11T04:00:00Z' }]);
  assert.deepEqual(supersededItems([item], { doneAfter: earlier }), [], 'earlier success');
  const same = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-12T04:00:00Z' }]);
  assert.deepEqual(supersededItems([item], { doneAfter: same }), [], 'simultaneous success');
});

test('a clean run of a DIFFERENT task supersedes nothing', () => {
  const item = parked({ task: 'digest' });
  const doneAfter = doneRuns([{ id: 'p/other', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([item], { doneAfter }), []);
});

test('a live item is the machinery working, not a superseded park', () => {
  const live = it({ task: 'digest', labels: ['task:status:running-agent'], updated_at: '2026-08-12T04:00:00Z' });
  const doneAfter = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([live], { doneAfter }), []);
});

// #1086's shape: an agent parked it `action` but never cleared `task:agent`. `statusOf`
// reads the park over the live label, so the rule sees it — which is the point, since a
// torn item is invisible to every other rule here.
test('a TORN park — carrying a live label too — is still superseded', () => {
  const torn = it({
    task: 'digest', updated_at: '2026-08-12T04:00:00Z',
    labels: ['task:status:running-agent', 'needs-human', 'task:status:needs-human-action'],
  });
  const doneAfter = doneRuns([{ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([torn], { doneAfter }).map((i) => i.number), [torn.number]);
});

test('the comment names the run that answered the park', () => {
  assert.match(supersededComment({ id: 'p/digest', number: 999, closed_at: '2026-08-13T04:00:00Z' }), /#999/);
});

// ---------------------------------------------------------------------------
// Rule F — the orphaned park. #1446 already closes an item whose task is gone, but only
// when the EXECUTOR picks it; a parked item is never picked again, so ClaudiniteCanary's
// seven parked fleet-digest items could never reach that path.

const known = (...ids) => new Set(ids);

test('a park whose task no longer exists at HEAD is orphaned', () => {
  const item = parked({ task: 'retired', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { knownTaskIds: known('p/alive') }).map((i) => i.number),
    [item.number]);
});

test('a park whose task still exists is left alone', () => {
  const item = parked({ task: 'alive', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { knownTaskIds: known('p/alive') }), []);
});

// The rule closes things, and its premise is "this id is not in the declared set". An
// empty set means discovery told us nothing, not that every task was retired — acting on
// it would close the entire queue.
test('an empty task set orphans NOTHING — discovery failing is not every task retiring', () => {
  const item = parked({ task: 'retired', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { knownTaskIds: known() }), []);
});

test('a live item is not orphaned — the executor owns that verdict', () => {
  const live = it({ task: 'retired', labels: ['task:status:running-agent'] });
  assert.deepEqual(orphanedParkItems([live], { knownTaskIds: known('p/alive') }), []);
});

test('the orphaned comment names the task that is gone', () => {
  assert.match(orphanedParkComment('p/retired'), /p\/retired/);
});
