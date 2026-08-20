import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickOrder, claimWinner, conflictsWithEarlierClaim, noGoPlan, rollBody, claimComment,
} from '../../../engine/scheduler/queue/executor.mjs';
import { CLAIM_MARKER, HANDOFF_MARKER, EPISODE_MARKER, parseWorkItemBody } from '../../../engine/scheduler/queue/work-item.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };

let seq = 900;
// Standing or ad-hoc is STRUCTURAL now (§15.26), so every rule that turns on it is
// driven the way production drives it: a frequency read off the declaration at HEAD.
// `daily` for the tasks these fixtures name, `manual` for the lever.
const frequencyOf = (id) => (id === 'p/lever' ? 'manual' : 'daily');

const it = ({ task = 'a', labels = ['task:ready'], created_at = '2026-08-14T04:00:00Z', qualifier = null }) => ({
  number: seq += 1,
  title: `[claudinite-work] p/${task}${qualifier ? ` ${qualifier}` : ''}`,
  body: `packs/p/tasks/${task}/task.md\n`, state: 'open', labels, created_at, updated_at: created_at,
});

// --- pick order ---------------------------------------------------------------

test('urgent first, always — whatever the draw says', () => {
  const a = it({ task: 'a', created_at: '2026-08-14T01:00:00Z' });
  const b = it({ task: 'b', created_at: '2026-08-14T02:00:00Z' });
  const urgent = it({ task: 'c', created_at: '2026-08-14T03:00:00Z', labels: ['task:ready', 'task:urgent'] });
  // The draw is taken in input order, so this one hands the urgent item the
  // WORST key: it still sorts first, because urgency outranks the draw.
  const seq = [0.1, 0.2, 0.9];
  let n = 0;
  assert.equal(pickOrder([b, a, urgent], { random: () => seq[n++] })[0].number, urgent.number);
});

// §15.20: the order among the ready is RANDOM, not oldest-first. A test that
// pinned one order would pass on a comparator that never shuffles, so this one
// asserts the property instead — every ready item reaches the head over enough
// draws, which a deterministic order can never do.
test('among the ready, the head varies across runs (§15.20)', () => {
  const items = ['a', 'b', 'c'].map((t, n) => it({ task: t, created_at: `2026-08-14T0${n + 1}:00:00Z` }));
  const heads = new Set();
  for (let n = 0; n < 200; n += 1) heads.add(pickOrder(items)[0].number);
  assert.equal(heads.size, items.length, 'every ready item was picked first at least once');
});

// …and the draw is injectable, so a caller that needs one fixed order gets it.
test('an injected draw fixes the order it would otherwise randomize', () => {
  const one = it({ task: 'a' });
  const two = it({ task: 'b' });
  const seq = [0.9, 0.1];
  let n = 0;
  assert.deepEqual(pickOrder([one, two], { random: () => seq[n++] }).map((i) => i.number),
    [two.number, one.number]);
});

test('the same-title mutex serializes twins and lets fan-out qualifiers through (S15/F6)', () => {
  const running = it({ task: 'a', labels: ['task:executing'] });
  const twin = it({ task: 'a', labels: ['task:ready'] });
  const sibling = it({ task: 'a', qualifier: 'member-x', labels: ['task:ready'] });
  assert.deepEqual(pickOrder([running, twin, sibling]).map((i) => i.number), [sibling.number]);
});

// S24 — the one trap found replaying the model. `after` is a pick-time YIELD and
// never a Blocked-by edge, because a standing item that rolls never closes.
test('the `after` yield skips a dependent only while its upstream is live this cycle (S24/S23)', () => {
  const taskAfter = (id) => (id === 'p/down' ? ['p/up'] : []);
  const down = it({ task: 'down' });

  for (const state of ['task:ready', 'task:executing', 'task:agent']) {
    const up = it({ task: 'up', labels: [state] });
    assert.equal(pickOrder([up, down], { taskAfter, frequencyOf }).some((i) => i.number === down.number), false,
      `a live upstream (${state}) holds the dependent back`);
  }
  // A ROLLED upstream declined this cycle; a broken one is in triage. Neither may
  // halt its dependents — the bound the old exclusive claim drew at three days.
  for (const state of ['task:blocked', 'needs-human']) {
    const up = it({ task: 'up', labels: [state] });
    assert.equal(pickOrder([up, down], { taskAfter, frequencyOf }).some((i) => i.number === down.number), true,
      `a ${state} upstream does not block`);
  }
  // …and with the upstream gone entirely, nothing to yield to.
  assert.deepEqual(pickOrder([down], { taskAfter, frequencyOf }).map((i) => i.number), [down.number]);
});

test('an ad-hoc item never yields — `after` is a scheduled-chain property', () => {
  const taskAfter = () => ['p/up'];
  const up = it({ task: 'up', labels: ['task:executing'] });
  // Both structural shapes of ad-hoc: a qualified item for a scheduled task, and a
  // `manual` task's item. Neither yields, and neither is yielded to.
  const qualified = it({ task: 'down', qualifier: '#42', labels: ['task:ready'] });
  const lever = it({ task: 'lever', labels: ['task:ready'] });
  assert.deepEqual(pickOrder([up, qualified, lever], { taskAfter, frequencyOf }).map((i) => i.number).sort(),
    [qualified.number, lever.number].sort(), 'both admitted — the order between them is the draw\'s');
});

test('a live AD-HOC upstream is not the upstream the yield waits on', () => {
  // The yield is between standing items: a fan-out target running under the
  // upstream's name is not that task's occurrence, so a dependent must not wait
  // behind it. The marker used to say this; the structure says it now.
  const taskAfter = (id) => (id === 'p/down' ? ['p/up'] : []);
  const down = it({ task: 'down' });
  const adHocUpstream = it({ task: 'up', qualifier: 'member-x', labels: ['task:executing'] });
  assert.deepEqual(pickOrder([adHocUpstream, down], { taskAfter, frequencyOf }).map((i) => i.number), [down.number]);
});

test('an item in triage is never picked', () => {
  const triage = it({ task: 'a', labels: ['task:ready', 'needs-human'] });
  assert.deepEqual(pickOrder([triage]), []);
});

// --- the claim lease ----------------------------------------------------------

const claim = (id, exec) => ({ id, body: claimComment({ executor: exec, runUrl: null, at: '2026-08-14T04:00:00Z' }) });

test('earliest claim wins by comment ID, never by timestamp', () => {
  // Same second, deliberately: GitHub's created_at granularity ties, comment ids
  // do not.
  const winner = claimWinner([claim(20, 'E2'), claim(10, 'E1')]);
  assert.match(winner.body, /executor `E1`/);
});

// F18 — over an item's lifetime dead claims accumulate; arbitrating over all of
// them makes a dead claim outrank every live claimant and the item livelocks.
test('the arbiter is episode-scoped: claims before the last boundary are dead (F18)', () => {
  const comments = [
    claim(10, 'E1'),                                        // a tenure that was reclaimed
    { id: 11, body: `${EPISODE_MARKER}\nreclaimed` },
    claim(12, 'E2'),                                        // this episode's only claim
  ];
  assert.match(claimWinner(comments).body, /executor `E2`/);
  assert.equal(claimWinner([claim(10, 'E1')]).id, 10);
  assert.equal(claimWinner([{ id: 1, body: 'just a comment' }]), null);
});

test('a torn label swap cannot mint a second owner — comments arbitrate, labels do not', () => {
  // Two executors both swapped; the lease is decided entirely by the comments.
  const comments = [claim(30, 'E2'), claim(29, 'E1')];
  assert.match(claimWinner(comments).body, /executor `E1`/);
});

// --- the post-claim re-verify (F15) -------------------------------------------

test('a twin holding an earlier claim forces a revert; a later one does not', () => {
  const mine = it({ task: 'a', labels: ['task:executing'] });
  const twinEarlier = { ...it({ task: 'a', labels: ['task:executing'] }), claimId: 5 };
  const twinLater = { ...it({ task: 'a', labels: ['task:executing'] }), claimId: 50 };
  assert.equal(conflictsWithEarlierClaim(mine, 10, [twinEarlier]), true);
  assert.equal(conflictsWithEarlierClaim(mine, 10, [twinLater]), false);
});

test('an upstream that claimed earlier forces its dependent to revert (F15)', () => {
  const taskAfter = (id) => (id === 'p/down' ? ['p/up'] : []);
  const mine = it({ task: 'down', labels: ['task:executing'] });
  const upstream = { ...it({ task: 'up', labels: ['task:executing'] }), claimId: 4 };
  assert.equal(conflictsWithEarlierClaim(mine, 9, [upstream], { taskAfter, frequencyOf }), true);
  // An unrelated item is not a conflict however early it claimed.
  const other = { ...it({ task: 'elsewhere', labels: ['task:executing'] }), claimId: 1 };
  assert.equal(conflictsWithEarlierClaim(mine, 9, [other], { taskAfter, frequencyOf }), false);
});

// --- the roll -----------------------------------------------------------------

test('a scheduled item ROLLS to its next anchor; an ad-hoc one closes obsolete (S17)', () => {
  const task = { decl: { frequency: 'daily' } };
  const scheduled = it({ task: 'a', labels: ['task:executing'] });
  const plan = noGoPlan(scheduled, task, SCHEDULE, new Date('2026-08-14T04:20:00Z'), 'nothing to do');
  assert.equal(plan.kind, 'roll');
  assert.equal(plan.until, '2026-08-15T04:00:00.000Z');

  // Ad-hoc by its qualifier, and ad-hoc by its task having no calendar: both close,
  // because neither has an anchor to roll to.
  const qualified = it({ task: 'a', qualifier: '#42', labels: ['task:executing'] });
  assert.equal(noGoPlan(qualified, task, SCHEDULE, new Date('2026-08-14T04:20:00Z'), 'settled on its own').kind, 'close');
  const lever = it({ task: 'lever', labels: ['task:executing'] });
  assert.equal(noGoPlan(lever, { decl: { frequency: 'manual' } }, SCHEDULE, new Date('2026-08-14T04:20:00Z'), 'nothing asked').kind, 'close');
});

test('the roll stamps the wake and keeps ONE verdict — the item is a status line, not a log', () => {
  const body = 'packs/p/tasks/a/task.md\n\nExecute the Claudinite task above.\n';
  const first = rollBody(body, '2026-08-15T04:00:00.000Z', 'no work', '2026-08-14T04:20:00Z');
  assert.equal(parseWorkItemBody(first).notBefore, '2026-08-15T04:00:00.000Z');
  assert.match(first, /### Last verdict/);

  const second = rollBody(first, '2026-08-16T04:00:00.000Z', 'still nothing', '2026-08-15T04:20:00Z');
  assert.equal((second.match(/### Last verdict/g) ?? []).length, 1);
  assert.match(second, /still nothing/);
  assert.doesNotMatch(second, /no work/);
  assert.equal(parseWorkItemBody(second).notBefore, '2026-08-16T04:00:00.000Z');
});

test('a claim comment names its executor, and the markers are the item\'s vocabulary', () => {
  assert.ok(claimComment({ executor: 'E1', runUrl: 'http://x', at: 'now' }).includes(CLAIM_MARKER));
  assert.ok(claimComment({ executor: 'E1', runUrl: 'http://x', at: 'now' }).includes('E1'));
  // The hand-off marker survives the retry's deletion: the janitor still reads it
  // to name which session went silent, and the session reads its nonce to prove
  // the fire it arrived on is this item's current hand-off.
  assert.equal(typeof HANDOFF_MARKER, 'string');
});
