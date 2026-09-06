import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staleReadyItems, deadAgentItems, stuckBlockedItems, statelessItems, periodForTasks,
  supersededItems, supersededComment, orphanedParkItems, orphanedParkComment,
  endedParkItems, endedParkComment, unclosedTerminalItems, unclosedTerminalComment,
  abandonedParkItems, abandonedParkComment, frequencyForTasks,
} from '../../queue/janitor-rules.mjs';
import { periodMs } from '../../queue/anchors.mjs';
import { isParked } from '../../queue/work-item.mjs';
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

// A BEATING SESSION IS JUDGED ON ITS PROGRESS, NOT ITS PUNCTUALITY. The beat resets
// the issue clock by existing, so once the agent phase beats, the clock alone would
// make every beating session immortal — including one that wedged an hour in. These
// two cases are the pair that separates them, and both are invisible to `updated_at`:
// the first has a stale clock and live work, the second a live clock and dead work.
test('a beating session that is still getting somewhere is spared, however stale its issue clock', () => {
  const working = it({ labels: ['task:agent'], updated_at: '2026-08-13T12:00:00Z' });
  const progressAt = () => '2026-08-14T03:50:00Z';
  assert.deepEqual(deadAgentItems([working], NOW, { progressAt }), []);
});

test('a session that keeps beating the same note is reclaimed on the same leash as one that went silent', () => {
  const wedged = it({ labels: ['task:agent'], updated_at: '2026-08-14T03:59:00Z' });
  // Punctual to the minute, and stuck since 00:30 — the clock says alive, the notes say no.
  const progressAt = () => '2026-08-14T00:30:00Z';
  assert.deepEqual(deadAgentItems([wedged], NOW, { progressAt }).map((i) => i.number), [wedged.number]);
  // Without the progress reader it is the fresh clock that answers, and nothing is reclaimed.
  assert.deepEqual(deadAgentItems([wedged], NOW), []);
});

// Every item filed before the beat existed answers null, and must be judged exactly
// as it was — this rule ships to a fleet whose sessions do not beat yet.
test('an item with no beats at all is judged off the issue clock, as before', () => {
  const dead = it({ labels: ['task:agent'], updated_at: '2026-08-14T00:00:00Z' });
  const live = it({ labels: ['task:agent'], updated_at: '2026-08-14T03:30:00Z' });
  const progressAt = () => null;
  assert.deepEqual(deadAgentItems([dead, live], NOW, { progressAt }).map((i) => i.number), [dead.number]);
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

// #1498 — every ad-hoc item runs the SAME task, so without this the newest
// verification to converge closes every parked one beside it. Two were closed on a
// third issue's evidence, their own `Verify:` never executed.
test('an AD-HOC park is never superseded — its work is its own, not an occurrence', () => {
  const own = parked({ task: 'implement-request' });
  own.title = 'Verify in production: the janitor stops closing verifications';
  own.labels = [...own.labels, 'task:origin:ad-hoc'];
  own.body = 'packs/claudinite-tasks/queue/tasks/implement-request/task.md\n';
  const doneAfter = doneRuns([{ id: 'engine/implement-request', number: 999, closed_at: '2026-08-13T04:00:00Z' }]);
  assert.deepEqual(supersededItems([own], { doneAfter }), [],
    "another ad-hoc run's success is evidence about that run, never about this issue's own assertion");
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

// The declared task set at HEAD, as the sweep supplies it: an id and where its worker
// lives. `it` files every item's body at `p/t.md`, so that is the path a live task has.
const heads = (...ids) => ids.map((id) => {
  const [pack, task] = id.split('/');
  return { pack, id: task, taskPath: 'p/t.md' };
});

test('a park whose task no longer exists at HEAD is orphaned', () => {
  const item = parked({ task: 'retired', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { tasks: heads('p/alive') }).map((i) => i.number),
    [item.number]);
});

test('a park whose task still exists, at the path the item names, is left alone', () => {
  const item = parked({ task: 'alive', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { tasks: heads('p/alive') }), []);
});

// The rule closes things, and its premise is "this repo cannot run this item". An
// empty set means discovery told us nothing, not that every task was retired — acting on
// it would close the entire queue.
test('an empty task set orphans NOTHING — discovery failing is not every task retiring', () => {
  const item = parked({ task: 'retired', kind: 'action' });
  assert.deepEqual(orphanedParkItems([item], { tasks: [] }), []);
});

test('a live item is not orphaned — the executor owns that verdict', () => {
  const live = it({ task: 'retired', labels: ['task:status:running-agent'] });
  assert.deepEqual(orphanedParkItems([live], { tasks: heads('p/alive') }), []);
});

test('the orphaned comment names the task that is gone', () => {
  assert.match(orphanedParkComment('p/retired'), /p\/retired/);
});

// The gap ClaudiniteCanary#115 sat in for eleven days (#1461). Its task is carried, so an
// id lookup alone reads it as live; what is dead is the PATH its body names, left behind
// by the `grow_with_claudinite` → `claudinite-growth` rename. Nothing rewrites an item
// body, so the executor's path guard refuses it on every pick, forever — and because a
// `failure` park holds the task's lane, the task stops being scheduled at all.
test('a park naming a live task at a path it no longer lives at is orphaned', () => {
  const moved = parked({ task: 'alive', kind: 'failure' });
  moved.body = 'packs/gone/tasks/alive/task.md\n';
  assert.deepEqual(orphanedParkItems([moved], { tasks: heads('p/alive') }).map((i) => i.number),
    [moved.number]);
});

// Conservative where the rule cannot know: a body naming no path at all is the malformed
// shape `statelessItems` and the executor own, not a verdict about HEAD.
test('a park naming no path at all is left alone — that is not this rule\'s verdict', () => {
  const pathless = parked({ task: 'alive', kind: 'failure' });
  pathless.body = '';
  assert.deepEqual(orphanedParkItems([pathless], { tasks: heads('p/alive') }), []);
});

test('the comment for a moved task names where it lives now, not just what is missing', () => {
  const body = orphanedParkComment('p/alive', 'packs/p/tasks/alive/task.md');
  assert.match(body, /packs\/p\/tasks\/alive\/task\.md/);
  assert.match(body, /renamed/);
});

// The two shapes a fleet-aged park arrives in, and why each is the rule's own premise
// rather than a decode detail (#1461). Both were live on ClaudiniteCanary when rule F
// first swept, and reading either literally gets the verdict exactly backwards.

test('a park wearing only the two-label era sub-label is seen — the rule reads the decode', () => {
  const legacy = it({ task: 'retired', labels: ['origin:schedule', 'task:needs-human-failure'] });
  assert.deepEqual(orphanedParkItems([legacy], { tasks: heads('p/alive') }).map((i) => i.number),
    [legacy.number]);
});

// A title is stored data that outlives a pack rename, so the id it names is canonicalized
// before it is looked up. Read literally, EVERY park filed before a rename reads as a task
// the repo no longer carries — and would close on the WRONG comment, naming a retirement
// that never happened. The `isParked` assertion is what stops the verdict passing for the
// wrong reason: an item the decode cannot see is not orphaned either.
test('a pre-rename pack id in the title resolves to today\'s spelling before the lookup', () => {
  const preRename = {
    number: 115,
    title: '[claudinite-work] grow_with_claudinite/logs-prune',
    labels: ['needs-human', 'origin:schedule', 'task:needs-human-failure'],
    state: 'open',
    body: '.claudinite/shared/packs/claudinite-growth/tasks/logs-prune/task.md\n',
    created_at: '2026-08-10T04:00:00Z',
    updated_at: '2026-08-10T04:00:00Z',
  };
  assert.ok(isParked(preRename));
  assert.deepEqual(orphanedParkItems([preRename], {
    tasks: [{ pack: 'claudinite-growth', id: 'logs-prune', taskPath: '.claudinite/shared/packs/claudinite-growth/tasks/logs-prune/task.md' }],
  }), []);
});

// ClaudiniteCanary#115 itself, whole: the title canonicalizes to a task Canary carries,
// and the body still names the pre-rename directory. Rule F must close this one.
test('ClaudiniteCanary#115 — a live task named at its pre-rename path — is orphaned', () => {
  const canary115 = {
    number: 115,
    title: '[claudinite-work] grow_with_claudinite/logs-prune',
    labels: ['needs-human', 'origin:schedule', 'task:needs-human-failure'],
    state: 'open',
    body: '.claudinite/shared/packs/grow_with_claudinite/tasks/logs-prune/task.md\n\nNot-before: 2026-08-20T04:00:00.000Z\n',
    created_at: '2026-08-19T03:55:44Z',
    updated_at: '2026-08-20T04:49:39Z',
  };
  assert.deepEqual(orphanedParkItems([canary115], {
    tasks: [{ pack: 'claudinite-growth', id: 'logs-prune', taskPath: '.claudinite/shared/packs/claudinite-growth/tasks/logs-prune/task.md' }],
  }).map((i) => i.number), [115]);
});

// --- rule G, the ended park (#1468) -------------------------------------------

const parkedOn = (pr, kind = 'approval') => it({
  labels: [`task:status:needs-human-${kind}`],
  body: `p/t.md\n\nEnds-when: #${pr} closed\n\nExecute the Claudinite task above.\n`,
});

test('an ended park is claimed only once its target actually resolves', () => {
  const open = parkedOn(133);
  assert.deepEqual(endedParkItems([open], { resolutionOf: () => null }), [],
    'an open pull request is the park doing its job');
  assert.deepEqual(endedParkItems([open], { resolutionOf: () => 'merged' }).map((i) => i.number), [open.number]);
  assert.deepEqual(endedParkItems([open], { resolutionOf: () => 'closed' }).map((i) => i.number), [open.number]);
});

test('every park kind may carry an end condition, and a live item may not', () => {
  for (const kind of ['approval', 'action', 'decision', 'failure']) {
    assert.equal(endedParkItems([parkedOn(1, kind)], { resolutionOf: () => 'merged' }).length, 1, kind);
  }
  const running = it({ labels: ['task:status:running-agent'], body: 'p/t.md\n\nEnds-when: #1 closed\n' });
  assert.deepEqual(endedParkItems([running], { resolutionOf: () => 'merged' }), [],
    'an item still with an agent has not ended anything');
});

// A condition the janitor cannot evaluate must read as "no end condition" — never as
// one that is met, which would close a park on a sentence nobody's code understood.
test('an unrecognised end condition reads as absent', () => {
  const odd = it({ labels: ['task:status:needs-human-approval'], body: 'p/t.md\n\nEnds-when: #133 merged\n' });
  const noField = it({ labels: ['task:status:needs-human-approval'] });
  assert.deepEqual(endedParkItems([odd, noField], { resolutionOf: () => 'merged' }), []);
});

test('the ended-park comment distinguishes what landed from what was abandoned', () => {
  assert.match(endedParkComment(133, 'merged'), /#133 merged/);
  assert.match(endedParkComment(133, 'merged'), /task:status:done/);
  assert.match(endedParkComment(133, 'closed'), /closed without merging/);
  assert.match(endedParkComment(133, 'closed'), /task:status:rejected/);
});

// ---------------------------------------------------------------------------
// Rule H — the unclosed terminal (#1526).

test('an open item wearing a terminal status is closed, whichever terminal it is', () => {
  const done = it({ labels: ['task:status:done'], updated_at: '2026-08-13T04:00:00Z' });
  const rejected = it({ labels: ['task:status:rejected'], updated_at: '2026-08-13T04:00:00Z' });
  assert.deepEqual(unclosedTerminalItems([done, rejected], NOW).map((i) => i.number), [done.number, rejected.number]);
  // The outcome is the status's own — nothing here relabels anything.
  assert.match(unclosedTerminalComment('task:status:done'), /nothing is left for anyone to act on/);
  assert.match(unclosedTerminalComment('task:status:rejected'), /re-queue/);
});

// A live status is the machinery working, and a park is a person's to answer.
test('a live or parked item is not an unclosed terminal', () => {
  const live = it({ labels: ['task:status:running-agent'], updated_at: '2026-08-13T04:00:00Z' });
  const park = parked({ kind: 'approval', updated_at: '2026-08-13T04:00:00Z' });
  assert.deepEqual(unclosedTerminalItems([live, park], NOW), []);
});

// The clock guard, and the reason for it: a converge writes the label and the close
// seconds apart, so a fresh terminal is a transition in flight, not a torn one
// (#1104's escalation of an item that settled 8 seconds later).
test('a terminal written moments ago is a converge in flight, not a torn one', () => {
  const settling = it({ labels: ['task:status:done'], updated_at: '2026-08-14T03:59:00Z' });
  assert.deepEqual(unclosedTerminalItems([settling], NOW), []);
});

// A legacy spelling decodes to the same terminal — the whole point of deciding by
// `statusOf` rather than by label text.
test('an item wearing an older engine\'s spelling of done is closed too', () => {
  const legacy = it({ labels: ['task:done'], updated_at: '2026-08-13T04:00:00Z' });
  assert.deepEqual(unclosedTerminalItems([legacy], NOW).map((i) => i.number), [legacy.number]);
});

// ---------------------------------------------------------------------------
// Rule I — the abandoned failure park (#1785).

const headTasks = [
  { pack: 'p', id: 'a', decl: { frequency: 'daily' } },
  { pack: 'p', id: 'manualish', decl: { frequency: 'manual' } },
];
const freq = frequencyForTasks(headTasks);
const LATER = '2026-09-06T04:00:00Z'; // ~26 days past the fixtures' default touch

test('a failure park nobody has touched for three weeks is closed', () => {
  const item = parked({ kind: 'failure', updated_at: '2026-08-10T04:00:00Z' });
  assert.deepEqual(abandonedParkItems([item], LATER, { frequencyFor: freq }).map((i) => i.number), [item.number]);
  assert.match(abandonedParkComment(), /task:status:rejected/);
});

// The bound is what separates a fault a person has not got to yet from one nobody
// is ever going to: inside it the park is doing its job.
test('a failure park inside the bound is left standing', () => {
  const fresh = parked({ kind: 'failure', updated_at: '2026-09-01T04:00:00Z' });
  assert.deepEqual(abandonedParkItems([fresh], LATER, { frequencyFor: freq }), []);
});

// The three parks that are a person's INBOX rather than a fault report: nothing here
// answers them, and age is not an answer either.
test('only the failure park is abandoned by the clock', () => {
  for (const kind of ['action', 'decision', 'approval']) {
    const item = parked({ kind, updated_at: '2026-08-10T04:00:00Z' });
    assert.deepEqual(abandonedParkItems([item], LATER, { frequencyFor: freq }), [], kind);
  }
});

// A bare legacy `needs-human` decodes to `failure` — and it is precisely the items
// an older engine parked that have been sitting longest (missingbulb/TLDR#275).
test('an older engine\'s bare park decodes to failure and is claimed', () => {
  const legacy = it({ labels: ['needs-human', 'origin:schedule'], updated_at: '2026-08-10T04:00:00Z' });
  assert.deepEqual(abandonedParkItems([legacy], LATER, { frequencyFor: freq }).map((i) => i.number), [legacy.number]);
});

// STANDING ONLY, structurally: the rule's warrant is that the item is a fungible
// occurrence whose lane the park is holding. A qualified item, a `manual` task's item
// and an adopted issue are each somebody's own work, and no clock answers those.
test('only a standing occurrence is abandoned', () => {
  const qualified = { ...parked({ updated_at: '2026-08-10T04:00:00Z' }), title: '[claudinite-work] p/a for #12' };
  const manual = parked({ task: 'manualish', updated_at: '2026-08-10T04:00:00Z' });
  const adHoc = { ...parked({ updated_at: '2026-08-10T04:00:00Z' }), title: 'Please fix the thing' };
  assert.deepEqual(abandonedParkItems([qualified, manual, adHoc], LATER, { frequencyFor: freq }), []);
});

// EMPTY MEANS UNKNOWN, as everywhere the janitor reads HEAD: a discovery that
// returned nothing must not read as "every task retired" and close the whole queue.
test('an unreadable task set claims nothing', () => {
  const item = parked({ kind: 'failure', updated_at: '2026-08-10T04:00:00Z' });
  assert.deepEqual(abandonedParkItems([item], LATER, { frequencyFor: frequencyForTasks([]) }), []);
});
