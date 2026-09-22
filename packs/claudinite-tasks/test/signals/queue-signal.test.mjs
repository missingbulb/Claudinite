import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSignals } from '../../src/signals/index.mjs';

// The `queue` signal — the OPEN work-item set, which is the one dimension the
// `issues` collector deliberately hides, so that the queue's own churn cannot wake
// an issue-gated task. Only a term that names `queue` ever sees it.

const NOW = '2026-09-05T16:00:00Z';
const item = (number, over = {}) => ({
  number, title: '[claudinite-work] p/t', body: 'packs/p/tasks/t/task.md\n', state: 'open',
  labels: ['task:status:waiting-for-executor', 'task:origin:planned'],
  created_at: '2026-09-05T04:05:00Z', closed_at: null, updated_at: '2026-09-05T04:05:00Z', ...over,
});
const ctx = (over = {}) => ({ repo: 'o/r', defaultBranch: 'main', now: NOW, sinceIso: null, task: { pack: 'p', id: 't' }, ...over });
const noGh = async () => { throw new Error('the collector must not read when the queue was handed in'); };

test('queue is every open item, whichever task it belongs to, off the queue the caller already holds', async () => {
  const items = [
    item(7),
    item(8, { state: 'closed', labels: ['task:status:done'], closed_at: '2026-09-05T05:00:00Z' }),
    item(9, { title: '[claudinite-work] p/other' }),
  ];
  const { queue } = await collectSignals(noGh, ctx({ items }), ['queue']);
  assert.deepEqual(queue.open.map((i) => i.number), [7, 9],
    'the janitor repairs the whole queue, so the signal is not scoped to the asking task; a closed item is finished');
  assert.deepEqual(queue.open[0].labels, ['task:status:waiting-for-executor', 'task:origin:planned'],
    'projected in the shape the janitor rules read — labels as names, so a rule can be handed this list unchanged');
});

test('queue reads the open list for itself when the caller holds no queue', async () => {
  const pages = [[{
    number: 4, title: '[claudinite-work] p/t', body: '', state: 'open',
    labels: [{ name: 'task:status:waiting-for-executor' }], created_at: NOW, updated_at: NOW,
  }]];
  let asked = 0;
  const gh = async (path) => {
    asked += 1;
    assert.match(path, /state=open/, 'the OPEN list API, never the search index (S6/F11)');
    return { status: 200, json: pages.shift() ?? [] };
  };
  const { queue } = await collectSignals(gh, ctx(), ['queue']);
  assert.equal(asked, 1, 'one page for a one-page queue');
  assert.deepEqual(queue.open.map((i) => i.number), [4]);
});

test('a queue that could not be read is an error, never an empty queue', async () => {
  const gh = async () => ({ status: 502, json: null });
  const { queue } = await collectSignals(gh, ctx(), ['queue']);
  assert.ok(queue.error, 'a truncated queue reads as a healthy one, which is the decline that never comes back');
});
