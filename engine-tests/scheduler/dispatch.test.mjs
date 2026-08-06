import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchTitle, dispatchTaskKey, parseDispatchTitle, isDispatchTitle,
  dispatchBody, deliveredLines, planDispatch, staleDispatchIssues, staleEscalationComment,
  rearmDispatchIssues, readyLabelOn, staleClaimedDispatchIssues, staleClaimComment,
  READY_LABEL, READY_FLEET_LABEL, NEEDS_HUMAN_LABEL, AGENT_RUNNING_LABEL,
  readyLabelForScope, SCHEDULER_LABELS,
} from '../../engine/scheduler/dispatch.mjs';

// --- identity: title / key / parse round-trip ---
test('dispatch title and key follow the [claudinite-task] <pack>/<task> <slot> shape', () => {
  assert.equal(dispatchTitle({ pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' }),
    '[claudinite-task] gcec/create-extractor h2026-07-22T14Z');
  assert.equal(dispatchTaskKey({ pack: 'gcec', task: 'create-extractor' }),
    '[claudinite-task] gcec/create-extractor');
});

test('parseDispatchTitle round-trips a title and rejects non-dispatch titles', () => {
  const t = dispatchTitle({ pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.deepEqual(parseDispatchTitle(t), { pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.equal(parseDispatchTitle('Claudinite tracker: Repo Tidy'), null);
  assert.equal(parseDispatchTitle('[claudinite-task] malformed'), null);
  assert.equal(isDispatchTitle(t), true);
  assert.equal(isDispatchTitle('some feature request'), false);
});

// --- body: first line is the task path; Context only when the precondition emits it ---
test('dispatchBody puts the task path first and includes Context only when present', () => {
  const withCtx = dispatchBody({
    taskPath: '.claudinite/local/packs/gcec/tasks/create-extractor/task.md',
    pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z',
    context: ['Eligible requests: #123, #125. #124 is blocked — do not touch it.'],
  });
  const lines = withCtx.split('\n');
  assert.equal(lines[0], '.claudinite/local/packs/gcec/tasks/create-extractor/task.md');
  assert.match(withCtx, /binding scope — do not re-decide it/);
  assert.match(withCtx, /### Context\n- Eligible requests: #123, #125\./);

  const noCtx = dispatchBody({ taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.equal(noCtx.split('\n')[0], 'p/task.md');
  assert.doesNotMatch(noCtx, /### Context/);
  assert.doesNotMatch(noCtx, /binding scope/); // no scope sentence with nothing to bind
});

// --- the Delivered section (#649) ---
// The agent's ONLY source for what preprocessing created. Before it existed, task docs
// told the agent to find its branch or PR by a naming convention — and a search that
// finds nothing is indistinguishable from nothing having been created.

test('dispatchBody names the artifacts preprocessing created, by identity', () => {
  const body = dispatchBody({
    taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-08-06',
    delivered: { branch: 'claudinite/maintenance-2026-08-06-l0i4gd', pr: 71, merged: false },
  });
  assert.match(body, /### Delivered by preprocessing/);
  assert.match(body, /- PR: #71 \(open\)/);
  assert.match(body, /- Branch: `claudinite\/maintenance-2026-08-06-l0i4gd`/);
  assert.match(body, /do not\nsearch for a branch or PR by name/);
});

test('dispatchBody says when the PR already merged — the case that fooled the agent', () => {
  // Sheepdog has no pull_request CI, so preprocessing merges in the same run. An agent
  // told to find the OPEN maintenance PR found none and concluded the cycle had delivered
  // nothing, while a withheld workflow file sat undelivered.
  const body = dispatchBody({
    taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-08-06',
    delivered: { branch: 'claudinite/maintenance-2026-08-06-l0i4gd', pr: 71, merged: true },
  });
  assert.match(body, /- PR: #71 \(already merged/);
  assert.match(body, /open your own PR for further work/);
});

test('dispatchBody omits the section entirely when nothing was created — absence is the signal', () => {
  for (const delivered of [null, undefined, {}, { branch: null, pr: null }]) {
    const body = dispatchBody({ taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd', delivered });
    assert.doesNotMatch(body, /### Delivered/, JSON.stringify(delivered));
  }
  // No placeholder line either: an agent must never read "none" as an artifact to find.
  assert.deepEqual(deliveredLines({ branch: null, pr: null, merged: false }), []);
});

// --- planDispatch: exactly-once, at-most-one-open, create ---
test('planDispatch creates when no issue exists for the task family', () => {
  const v = planDispatch({ existing: [], pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'create');
  assert.equal(v.title, '[claudinite-task] gcec/create-extractor h2026-07-22T14Z');
  assert.equal(v.label, READY_LABEL);
});

test('the self/fleet split: readyLabelForScope maps scope → label, and planDispatch files under it', () => {
  assert.equal(readyLabelForScope(undefined), READY_LABEL);   // default (no scope) → self
  assert.equal(readyLabelForScope('self'), READY_LABEL);
  assert.equal(readyLabelForScope('fleet'), READY_FLEET_LABEL);
  // a fleet task's dispatch carries the fleet label so the fleet executor runs it
  const v = planDispatch({ existing: [], pack: 'canon-curation', task: 'growth-promote', slotId: 'd2026-07-24', readyLabel: READY_FLEET_LABEL });
  assert.equal(v.action, 'create');
  assert.equal(v.label, READY_FLEET_LABEL);
  // both ready labels are in the ensure-set the scheduler creates
  const names = SCHEDULER_LABELS.map((l) => l.name);
  assert.ok(names.includes(READY_LABEL) && names.includes(READY_FLEET_LABEL));
});

test('planDispatch skips when this exact slot already exists in any state (exactly-once)', () => {
  const existing = [{ number: 9, title: '[claudinite-task] gcec/create-extractor h2026-07-22T14Z', state: 'closed' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'skip');
});

test('planDispatch suppresses a new filing while any slot of the task is still open (at-most-one-open)', () => {
  const existing = [{ number: 12, title: '[claudinite-task] gcec/create-extractor h2026-07-22T13Z', state: 'open' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'suppress');
  assert.equal(v.openIssue, 12);
});

test('planDispatch does not confuse a task whose name prefixes another (the trailing-space guard)', () => {
  // An open `extract-more` issue must not suppress `extract`, and vice versa.
  const existing = [{ number: 5, title: '[claudinite-task] gcec/extract-more h2026-07-22T13Z', state: 'open' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'extract', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'create');
});

test('planDispatch prefers the exactly-once skip over the open-suppress when both could apply', () => {
  const existing = [
    { number: 20, title: '[claudinite-task] gcec/create-extractor h2026-07-22T14Z', state: 'open' },
  ];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'skip'); // the exact-slot match wins — never re-file the same slot
});

// --- staleDispatchIssues: older than ~2 periods, by slot kind ---
test('staleDispatchIssues flags issues older than 2 of their own period and spares fresh ones', () => {
  const now = '2026-07-22T12:00:00Z';
  const open = [
    { number: 1, title: '[claudinite-task] gcec/create-extractor h2026-07-22T09Z', created_at: '2026-07-22T09:05:00Z' }, // hourly, ~3h old > 2h → stale
    { number: 2, title: '[claudinite-task] gcec/create-extractor h2026-07-22T11Z', created_at: '2026-07-22T11:20:00Z' }, // hourly, <2h → fresh
    { number: 3, title: '[claudinite-task] basics/baselining d2026-07-21', created_at: '2026-07-21T02:00:00Z' }, // daily, ~34h < 48h → fresh
    { number: 4, title: 'unrelated feature request', created_at: '2020-01-01T00:00:00Z' }, // not a dispatch issue → ignored
  ];
  const stale = staleDispatchIssues(open, now);
  assert.deepEqual(stale.map((i) => i.number), [1]);
});

test('staleDispatchIssues respects a daily issue crossing the 2-day threshold', () => {
  const now = '2026-07-24T05:00:00Z';
  const open = [{ number: 7, title: '[claudinite-task] basics/baselining d2026-07-21', created_at: '2026-07-21T02:00:00Z' }]; // ~3d old > 2d
  assert.deepEqual(staleDispatchIssues(open, now).map((i) => i.number), [7]);
});

test('staleEscalationComment names the task and the needs-human label', () => {
  const c = staleEscalationComment({ number: 1, title: '[claudinite-task] gcec/create-extractor h2026-07-22T09Z' });
  assert.match(c, /gcec\/create-extractor \(slot h2026-07-22T09Z\)/);
  assert.match(c, new RegExp(NEEDS_HUMAN_LABEL));
});

// --- re-arming a lost trigger -----------------------------------------------
// The recovery that used to be the executor's drain sweep. The sweep is what
// turned one scheduler run's N dispatches into N sessions each racing over the
// same N issues, so it moved here, into code that runs once per run.

const armed = (over = {}) => ({
  number: 1, title: '[claudinite-task] basics/baselining d2026-07-22',
  labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z',
  updated_at: '2026-07-22T01:00:00Z', comments: 0, ...over,
});

test('readyLabelOn finds whichever ready label an issue carries, and nothing else', () => {
  assert.equal(readyLabelOn(armed()), READY_LABEL);
  assert.equal(readyLabelOn(armed({ labels: [{ name: READY_FLEET_LABEL }] })), READY_FLEET_LABEL);
  assert.equal(readyLabelOn(armed({ labels: ['ready-for-agent'] })), READY_LABEL); // bare strings too
  assert.equal(readyLabelOn(armed({ labels: [{ name: AGENT_RUNNING_LABEL }] })), null);
  assert.equal(readyLabelOn({ labels: [] }), null);
});

test('rearmDispatchIssues re-arms an armed, unclaimed, uncommented issue past the grace window', () => {
  const now = '2026-07-22T02:00:00Z'; // 1h after filing, well past the 20m grace
  assert.deepEqual(rearmDispatchIssues([armed()], now).map((i) => i.number), [1]);
});

test('rearmDispatchIssues spares an issue a live session may still be reaching for', () => {
  const now = '2026-07-22T01:10:00Z'; // only 10m old — inside the grace window
  assert.deepEqual(rearmDispatchIssues([armed()], now), []);
});

test('rearmDispatchIssues never re-arms an issue some session has already engaged', () => {
  const now = '2026-07-22T02:00:00Z';
  const cases = [
    armed({ number: 2, labels: [{ name: AGENT_RUNNING_LABEL }] }),           // claimed
    armed({ number: 3, labels: [{ name: READY_LABEL }, { name: NEEDS_HUMAN_LABEL }] }), // converged to triage
    armed({ number: 4, comments: 1 }),                                       // a session commented
    armed({ number: 5, labels: [] }),                                        // not armed at all
    armed({ number: 6, title: 'an ordinary issue someone labelled by hand' }), // not a dispatch issue
  ];
  assert.deepEqual(rearmDispatchIssues(cases, now), []);
});

test('rearmDispatchIssues re-arms a fleet dispatch under its OWN label, never the self one', () => {
  const now = '2026-07-22T02:00:00Z';
  const fleet = armed({ number: 9, labels: [{ name: READY_FLEET_LABEL }] });
  const [got] = rearmDispatchIssues([fleet], now);
  assert.equal(readyLabelOn(got), READY_FLEET_LABEL);
});

test('a stale issue is never re-armed — it is converging to triage, and re-arming would loop it', () => {
  // Daily slot filed ~3d ago: past the 2-period stale threshold AND past the grace
  // window, so the two rules overlap and stale has to win.
  const now = '2026-07-25T05:00:00Z';
  const old = armed({ created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z' });
  assert.deepEqual(staleDispatchIssues([old], now).map((i) => i.number), [1]);
  assert.deepEqual(rearmDispatchIssues([old], now), []);
});

// --- dead claims: the executor's old step-6 sweep, now code ------------------
test('staleClaimedDispatchIssues converges a claim left by a session that died mid-run', () => {
  const now = '2026-07-22T12:00:00Z';
  const open = [
    { number: 1, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T02:00:00Z' }, // 10h idle
    { number: 2, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T11:00:00Z' }, // 1h idle → live
    { number: 3, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }, { name: NEEDS_HUMAN_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T02:00:00Z' }, // already triaged
  ];
  assert.deepEqual(staleClaimedDispatchIssues(open, now).map((i) => i.number), [1]);
});

test('staleClaimedDispatchIssues never touches a claim on an issue a TASK owns', () => {
  // A task may hold `agent-running` on its own request issue for days while its PR
  // is in review. Only a `[claudinite-task]` title is the scheduler's to reclaim.
  const now = '2026-07-30T12:00:00Z';
  const open = [{ number: 5, title: 'Extractor request: some site', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z' }];
  assert.deepEqual(staleClaimedDispatchIssues(open, now), []);
});

test('staleClaimComment names the task and the needs-human label', () => {
  const c = staleClaimComment({ number: 1, title: '[claudinite-task] basics/baselining d2026-07-22' });
  assert.match(c, /basics\/baselining \(slot d2026-07-22\)/);
  assert.match(c, new RegExp(NEEDS_HUMAN_LABEL));
  assert.match(c, new RegExp(AGENT_RUNNING_LABEL));
});
