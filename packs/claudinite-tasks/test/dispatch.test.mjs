import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchTitle, dispatchTaskKey, parseDispatchTitle, isDispatchTitle,
  dispatchBody, deliveredLines, escalationLines, planDispatch, staleDispatchIssues, staleEscalationComment,
  rearmDispatchIssues, readyLabelOn, staleClaimedDispatchIssues, staleClaimComment,
  READY_LABEL, READY_FLEET_LABEL, NEEDS_HUMAN_LABEL, AGENT_RUNNING_LABEL,
  readyLabelForScope, SCHEDULER_LABELS, escalationLabel, ESCALATION_LABEL_PREFIX,
} from '../dispatch.mjs';

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

// --- the Delivered section ---
// The agent's source for what preprocessing created: a PR number and a branch ref.

test('dispatchBody names the artifacts code-work created, by identity', () => {
  const body = dispatchBody({
    taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-08-06',
    delivered: { branch: 'claudinite/maintenance-2026-08-06-l0i4gd', pr: 71, merged: false },
  });
  assert.match(body, /### Delivered by code-work/);
  assert.match(body, /- PR: #71 \(open\)/);
  assert.match(body, /- Branch: `claudinite\/maintenance-2026-08-06-l0i4gd`/);
});

test('dispatchBody distinguishes a merged PR from an open one', () => {
  // On a repo with no pull_request CI, preprocessing merges in the same run — the agent
  // works on its own PR from there rather than the one named.
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
  // No placeholder line either — absence is what says nothing was created.
  assert.deepEqual(deliveredLines({ branch: null, pr: null, merged: false }), []);
});

// --- the Why section (#664) ---
// Which of preprocessing's escalation conditions fired. Without it the agent re-derives
// all four from the repo, and a wrong re-derivation is how EdFringeAllocator#82 reported
// "preprocessing created nothing" about a cycle that had merged a PR a second earlier.

test('dispatchBody names the condition that woke the agent', () => {
  const body = dispatchBody({
    taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-08-06',
    reason: { code: 'checks-not-green', detail: 'check_the_world reported findings on the converged tree' },
  });
  assert.match(body, /### Why the agent is here/);
  assert.match(body, /check_the_world reported findings/);
  assert.match(body, /`checks-not-green`/);   // the stable id, for a consumer that branches on it
});

test('dispatchBody puts why before what — the reason decides which artifacts matter', () => {
  const body = dispatchBody({
    taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd',
    reason: { code: 'withheld-workflows', detail: '1 workflow file(s) the Action token cannot push' },
    delivered: { branch: 'claudinite/maintenance-2026-08-06-l0i4gd', pr: 71, merged: false },
  });
  assert.ok(body.indexOf('### Why the agent is here') < body.indexOf('### Delivered by code-work'));
});

test('dispatchBody omits the Why section when no reason was named — never a false claim', () => {
  // An older vendored worker names no reason. Absence must read as "nothing asserted",
  // which is what lets the task file fall back to its own full sweep.
  for (const reason of [null, undefined, {}, { code: null, detail: null }]) {
    const body = dispatchBody({ taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd', reason });
    assert.doesNotMatch(body, /### Why the agent is here/, JSON.stringify(reason));
  }
  assert.deepEqual(escalationLines({ code: null, detail: null }), []);
});

test('escalationLines: a code with no detail still says something true', () => {
  const lines = escalationLines({ code: 'selftest-failed' });
  assert.ok(lines.length > 0);
  assert.match(lines.join('\n'), /selftest-failed/);
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

// --- planDispatch: a terminal is not a claim (#821) ---
// The guard suppresses on LIVE work. `needs-human` is a terminal awaiting a
// person, so it must not stop the task — that is what left 13 tasks across 9
// repos filing nothing, the oldest since 2026-07-23.
test('planDispatch files the next slot while an escalated (needs-human) issue stays open', () => {
  const existing = [{
    number: 182, title: '[claudinite-task] basics/update d2026-08-13', state: 'open',
    labels: [{ name: NEEDS_HUMAN_LABEL }],
  }];
  const v = planDispatch({ existing, pack: 'basics', task: 'update', slotId: 'd2026-08-14' });
  assert.equal(v.action, 'create');
});

test('planDispatch still suppresses on a live claim — agent-running, or a just-filed issue with no labels yet', () => {
  const claimed = [{
    number: 12, title: '[claudinite-task] gcec/create-extractor h2026-07-22T13Z', state: 'open',
    labels: [{ name: AGENT_RUNNING_LABEL }],
  }];
  assert.equal(planDispatch({ existing: claimed, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' }).action, 'suppress');
  // an issue filed seconds ago carries only its ready label — a claim about to happen
  const armed = [{
    number: 13, title: '[claudinite-task] gcec/create-extractor h2026-07-22T13Z', state: 'open',
    labels: [{ name: READY_LABEL }],
  }];
  assert.equal(planDispatch({ existing: armed, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' }).action, 'suppress');
});

test('planDispatch bounds the re-filing: escalations that accumulate unresolved stop the lane, and say so', () => {
  const escalated = (number, slotId) => ({
    number, title: `[claudinite-task] basics/update ${slotId}`, state: 'open',
    labels: [{ name: NEEDS_HUMAN_LABEL }],
  });
  const existing = [escalated(182, 'd2026-08-13'), escalated(190, 'd2026-08-14')];
  const v = planDispatch({ existing, pack: 'basics', task: 'update', slotId: 'd2026-08-15' });
  assert.equal(v.action, 'suppress');
  assert.equal(v.escalated, true); // held for triage, NOT "a session is working it"
  assert.match(v.reason, /triage/);
});

test('planDispatch reports a live claim as a claim even when escalations are also open', () => {
  const existing = [
    { number: 182, title: '[claudinite-task] basics/update d2026-08-13', state: 'open', labels: [{ name: NEEDS_HUMAN_LABEL }] },
    { number: 190, title: '[claudinite-task] basics/update d2026-08-14', state: 'open', labels: [{ name: AGENT_RUNNING_LABEL }] },
  ];
  const v = planDispatch({ existing, pack: 'basics', task: 'update', slotId: 'd2026-08-15' });
  assert.equal(v.action, 'suppress');
  assert.equal(v.openIssue, 190);
  assert.notEqual(v.escalated, true);
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

// Escalation adds a label and leaves the issue OPEN, so without a guard the same
// issue matches forever and the shell re-posts the identical comment every run.
// ClaudiniteCanary#2 carried four of them, one per hourly run.
test('staleDispatchIssues escalates an issue once — an already-escalated one is done', () => {
  const now = '2026-07-24T05:00:00Z';
  const old = { number: 7, title: '[claudinite-task] basics/baselining d2026-07-21', created_at: '2026-07-21T02:00:00Z' };
  assert.deepEqual(staleDispatchIssues([old], now).map((i) => i.number), [7]); // first pass: escalate
  const escalated = { ...old, labels: [{ name: NEEDS_HUMAN_LABEL }] };
  assert.deepEqual(staleDispatchIssues([escalated], now), []);                 // every pass after: silent
  assert.deepEqual(staleDispatchIssues([{ ...escalated, labels: [NEEDS_HUMAN_LABEL] }], now), []); // bare-string labels too
});

// The two sweeps overlapped on an old claimed issue, and the shell runs stale first
// (`deadClaims` filters out anything already in `stale`) — so the issue was told "no
// executor session ran it" about a session that demonstrably ran. Claimed issues
// belong to the claim sweep, which says the true thing.
test('staleDispatchIssues leaves a CLAIMED issue to the claim sweep, which words it correctly', () => {
  const now = '2026-07-25T05:00:00Z';
  const claimed = {
    number: 8,
    title: '[claudinite-task] basics/baselining d2026-07-21',
    created_at: '2026-07-21T02:00:00Z',
    updated_at: '2026-07-21T02:00:00Z',
    labels: [{ name: AGENT_RUNNING_LABEL }],
  };
  assert.deepEqual(staleDispatchIssues([claimed], now), []);
  assert.deepEqual(staleClaimedDispatchIssues([claimed], now).map((i) => i.number), [8]);
  assert.match(staleClaimComment(claimed), new RegExp(AGENT_RUNNING_LABEL));
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

test('every scheduler label description fits GitHub\'s 100-char cap', () => {
  // Over the cap, the create 422s and — worse — the reconcile PATCH 422s on
  // EVERY labels-ensured run, forever (observed live on ready-for-agent-fleet,
  // 106 chars, 2026-08-07). The API rejects it; nothing self-heals it.
  for (const l of SCHEDULER_LABELS) {
    assert.ok(l.description.length <= 100, `${l.name}: ${l.description.length} chars`);
  }
});

test('an escalation code mints a queryable label; a malformed one mints none', () => {
  const l = escalationLabel('checks-not-green');
  assert.equal(l.name, `${ESCALATION_LABEL_PREFIX}checks-not-green`);
  assert.match(l.description, /checks-not-green/);
  assert.ok(/^[0-9a-f]{6}$/.test(l.color), 'a label needs a real colour or GitHub picks grey forever');
  // The counting surface is the label NAME, so a code that would make an
  // unqueryable or forged one is refused outright — the body still names it.
  for (const bad of [null, undefined, 42, '', 'Checks Not Green', 'checks_not_green', '-leading', 'trailing-', 'a--b']) {
    assert.equal(escalationLabel(bad), null, JSON.stringify(bad));
  }
});

test('a minted escalation label fits GitHub\'s 100-char description cap', () => {
  // Same failure the SCHEDULER_LABELS cap test exists for, one level nastier: this
  // description is built from the code, so length is only bounded by the code's.
  const longest = 'a'.repeat(50);
  assert.ok(escalationLabel(longest).description.length <= 100, 'the mint template leaves no room for a long code');
});
