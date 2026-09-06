import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN_MANUAL, ORIGIN_AD_HOC, ORIGIN_PLANNED, ORIGIN_LABELS, QUEUE_LABELS,
  originOf, itemFacts, workItemBody,
} from '../../queue/work-item.mjs';
import { supersededItems } from '../../queue/janitor-rules.mjs';

// WHY THIS ITEM EXISTS, told apart from WHO IT IS ABOUT. `ad-hoc` used to carry
// two unlike things: a person's own issue adopted as itself, and an occurrence of
// a declared task somebody pulled the lever on. Only the second names a task the
// queue already knows, and the two are exempted from the supersede rule for
// different reasons — so they are different labels.
const item = (n, labels, extra = {}) => ({
  number: n, title: '[claudinite-work] p/t', state: 'open', labels: labels.map((name) => ({ name })),
  updated_at: '2026-09-01T00:00:00Z', body: 'packs/p/tasks/t/task.md\n', ...extra,
});

test('manual is an origin of its own, decoded and ensured like the rest', () => {
  assert.equal(ORIGIN_MANUAL, 'task:origin:manual');
  assert.ok(ORIGIN_LABELS.includes(ORIGIN_MANUAL));
  assert.ok(QUEUE_LABELS.some((l) => l.name === ORIGIN_MANUAL), 'GitHub 422s a label the queue has not ensured');
  assert.equal(originOf(item(1, [ORIGIN_MANUAL])), ORIGIN_MANUAL);
});

test('a pulled run is not the scheduler\'s own occurrence, whatever its body says', () => {
  // The lever stamps `Woken:` too, so this is the read that has to hold when it
  // does not — an item filed by a fielded engine, or one whose body was edited.
  const bare = workItemBody({ taskPath: 'packs/p/tasks/t/task.md' });
  assert.equal(itemFacts(item(1, [ORIGIN_MANUAL], { body: bare })).woken, true);
  assert.equal(itemFacts(item(1, [ORIGIN_PLANNED], { body: bare })).woken, false);
});

test('the supersede rule exempts a pulled run exactly as it exempts an adopted issue', () => {
  const parked = (n, origin) => item(n, [origin, 'task:status:needs-human-failure']);
  const doneAfter = () => ({ number: 99, closed_at: '2026-09-03T00:00:00Z' });
  const open = [parked(1, ORIGIN_PLANNED), parked(2, ORIGIN_AD_HOC), parked(3, ORIGIN_MANUAL)];
  assert.deepEqual(supersededItems(open, { doneAfter }).map((i) => i.number), [1],
    'a pulled run is a specific ask; a later clean occurrence did different work');
});
