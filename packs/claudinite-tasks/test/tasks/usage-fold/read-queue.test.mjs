import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeReader, readQueueOutcomes, recordFor, taskOf, lookbackFrom, FIRST_READ_LOOKBACK_DAYS,
} from '../../../tasks/usage-fold/read-queue.mjs';
import {
  WORK_PREFIX, ORIGIN_AD_HOC, OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
  MACHINE_BLOCK_START, MACHINE_BLOCK_END,
} from '../../../queue/work-item.mjs';

// A body carrying the machine block the queue writes, built from the queue's own
// markers rather than a copied string.
const renderItemBody = (taskPath) =>
  `someone's own words\n\n${MACHINE_BLOCK_START}\n${taskPath}\n${MACHINE_BLOCK_END}\n`;

// Items as the issues API answers them, built through the queue's own title grammar
// rather than a hand-typed string: the point of this reader is that it agrees with the
// queue about what an item IS.
const item = (over = {}) => ({
  number: 1,
  title: `${WORK_PREFIX} claudinite-growth/usage-fold`,
  body: '',
  labels: [],
  state: 'closed',
  closed_at: '2026-08-20T10:00:00Z',
  ...over,
});

const labelled = (name) => [{ name }];

function fakeGh(pages) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    return { status: 200, json: async () => pages[page - 1] ?? [] };
  };
  return { reader: makeReader({ token: 't', api: 'https://api.test', fetchImpl }), calls };
}

test('an item is filed under the task its title names, and its outcome word', () => {
  assert.deepEqual(recordFor(item({ labels: labelled(OUTCOME_DONE) }), null), {
    date: '2026-08-20',
    closedAt: '2026-08-20T10:00:00Z',
    pack: 'claudinite-growth',
    task: 'usage-fold',
    outcome: 'done',
  });
  assert.equal(recordFor(item({ labels: labelled(OUTCOME_DELIVERED) }), null).outcome, 'delivered');
  assert.equal(recordFor(item({ labels: labelled(OUTCOME_OBSOLETE) }), null).outcome, 'obsolete');
  // A closed item wearing no outcome at all is a real state — the run ended without
  // converging one — and it is counted as such rather than dropped.
  assert.equal(recordFor(item(), null).outcome, 'none');
});

test('an ADOPTED marked issue keeps the person\'s title and is found by its machine block', () => {
  // The one-issue request model: the item's title is whatever the person wrote, so the
  // task comes from the worker path in its body. Without this, every request-shaped run
  // would be counted as belonging to no task and silently dropped.
  const adopted = item({
    title: 'the growth extract is picking up merge commits',
    body: renderItemBody('packs/claudinite-growth/tasks/growth-extract/task.mjs'),
    labels: [{ name: ORIGIN_AD_HOC }, ...labelled(OUTCOME_DONE)],
  });
  assert.deepEqual(taskOf(adopted), { pack: 'claudinite-growth', task: 'growth-extract' });
});

test('an issue that is not a work item, or has not closed, is not this fold\'s business', () => {
  assert.equal(recordFor(item({ title: 'a plain issue somebody filed', body: '', labels: [] }), null), null);
  assert.equal(recordFor(item({ state: 'open', closed_at: null }), null), null);
});

test('only items that closed PAST the mark are counted — exactly once, ever', () => {
  // The listing is asked for everything TOUCHED since the mark, because a comment on
  // an old item counts as a touch. Counting on `closed_at` instead is the whole
  // exactly-once mechanism: an item counted last fold cannot be counted again by being
  // commented on today.
  const mark = '2026-08-20T10:00:00Z';
  assert.equal(recordFor(item({ closed_at: mark }), mark), null, 'exactly the mark — already counted');
  assert.equal(recordFor(item({ closed_at: '2026-08-20T09:00:00Z' }), mark), null, 'closed before it');
  assert.ok(recordFor(item({ closed_at: '2026-08-20T11:00:00Z' }), mark));
});

test('readQueueOutcomes pages, filters PRs out, and advances the mark to the newest close', async () => {
  const { reader, calls } = fakeGh([
    [
      item({ number: 2, closed_at: '2026-08-20T12:00:00Z', labels: labelled(OUTCOME_DONE) }),
      { ...item({ number: 3 }), pull_request: { url: 'x' } },      // the issues endpoint answers with both
      item({ number: 4, closed_at: '2026-08-20T11:00:00Z' }),
    ],
  ]);
  const out = await readQueueOutcomes({ reader, repo: 'o/r', since: '2026-08-20T10:00:00Z', now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.records.map((r) => [r.task, r.outcome]), [['usage-fold', 'done'], ['usage-fold', 'none']]);
  assert.equal(out.watermark, '2026-08-20T12:00:00Z');
  assert.equal(calls.length, 1, 'a short page is the end of the window');
  assert.ok(calls[0].includes('state=closed'));
});

test('a fold that found nothing keeps the mark it was given', async () => {
  const { reader } = fakeGh([[]]);
  const out = await readQueueOutcomes({ reader, repo: 'o/r', since: '2026-08-20T10:00:00Z', now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.records, []);
  assert.equal(out.watermark, '2026-08-20T10:00:00Z');
});

test('an unreadable listing costs the queue rows and leaves the mark alone', async () => {
  const reader = { json: async () => { throw new Error('network'); } };
  const out = await readQueueOutcomes({ reader, repo: 'o/r', since: '2026-08-20T10:00:00Z', now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.records, []);
  assert.equal(out.watermark, '2026-08-20T10:00:00Z');
  assert.match(out.error, /could not be listed/);
});

test('the first read covers the day tier\'s whole width, so one fold fills it', async () => {
  assert.equal(FIRST_READ_LOOKBACK_DAYS, 30);
  assert.equal(lookbackFrom('2026-08-21T11:00:00Z').slice(0, 10), '2026-07-22');
  const { reader, calls } = fakeGh([[]]);
  await readQueueOutcomes({ reader, repo: 'o/r', since: null, now: '2026-08-21T11:00:00Z' });
  assert.ok(calls[0].includes(encodeURIComponent('2026-07-22')), calls[0]);
});
