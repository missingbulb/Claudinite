// What a closed work item answers: its outcome, the parks it collected, the four
// latencies between its label events, and the executor cost records riding its
// comments — all off one timeline read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latencyOf, parksIn, costsIn, readClosedItems,
} from '../../../tasks/tasks-usage-fold/read-items.mjs';
import { RUN_COST_TAG } from '../../../src/items/run-record.mjs';

const NOW = '2026-09-15T12:00:00Z';

const labeled = (name, at) => ({ event: 'labeled', label: { name }, created_at: at });
const commented = (body, at) => ({ event: 'commented', body, created_at: at });

const ITEM = {
  number: 42,
  title: '[claudinite-work] p/a',
  body: 'packs/p/tasks/a/task.md\n',
  labels: [{ name: 'task:status:done' }],
  created_at: '2026-09-15T05:12:00Z',
  closed_at: '2026-09-15T05:40:00Z',
};

const TIMELINE = [
  labeled('task:status:waiting-for-executor', '2026-09-15T05:12:00Z'),
  labeled('task:status:running-executor', '2026-09-15T05:20:00Z'),
  labeled('task:status:running-agent', '2026-09-15T05:25:00Z'),
  commented(`ran\n\n\`\`\`\nclaudinite-task-exec v1 p/a [#42] success\n${RUN_COST_TAG} v1 executor [77] calls=31 pick=1000 claim=2000\n\`\`\``, '2026-09-15T05:40:00Z'),
];

test('the four latencies are measured between the events that bound each', () => {
  const row = latencyOf({
    item: ITEM,
    timeline: TIMELINE,
    schedulerRuns: [{ startedAt: '2026-09-15T05:10:00Z' }, { startedAt: '2026-09-15T17:10:00Z' }],
  });
  assert.deepEqual(row, {
    tickToItemMinutes: 2,          // 05:10 tick -> 05:12 item
    itemToPickMinutes: 8,          // 05:12 item -> 05:20 pick
    pickToHandOffMinutes: 5,       // 05:20 pick -> 05:25 hand-off
    handOffToConvergeMinutes: 15,  // 05:25 hand-off -> 05:40 close
  });
});

test('a step that never happened has no key at all, which is not a latency of zero', () => {
  const agentless = TIMELINE.filter((e) => e.label?.name !== 'task:status:running-agent');
  const row = latencyOf({ item: ITEM, timeline: agentless, schedulerRuns: [] });
  assert.ok(!('handOffToConvergeMinutes' in row), 'an agentless item has no hand-off to measure from');
  assert.ok(!('tickToItemMinutes' in row), 'a tick outside the window this fold read is unknown');
  assert.equal(row.itemToPickMinutes, 8);
});

test('the tick an item is measured from is the newest one that had already started', () => {
  const row = latencyOf({
    item: ITEM,
    timeline: TIMELINE,
    schedulerRuns: [
      { startedAt: '2026-09-14T17:10:00Z' },
      { startedAt: '2026-09-15T05:10:00Z' },
      { startedAt: '2026-09-15T05:30:00Z' },   // after the item was filed — not its tick
    ],
  });
  assert.equal(row.tickToItemMinutes, 2);
});

test('an item picked twice is measured from the first pick, not the re-queued one', () => {
  // The latency is the queue's own — how long the item waited after being filed —
  // and a hand re-queue hours later is not that.
  const row = latencyOf({
    item: ITEM,
    timeline: [...TIMELINE, labeled('task:status:running-executor', '2026-09-15T09:00:00Z')],
    schedulerRuns: [],
  });
  assert.equal(row.itemToPickMinutes, 8);
});

test('a park kind is counted once for an item however often it was worn', () => {
  const kinds = parksIn([
    labeled('task:status:needs-human-failure', '2026-09-15T05:30:00Z'),
    labeled('task:status:needs-human-failure', '2026-09-15T06:30:00Z'),
    labeled('task:status:needs-human-approval', '2026-09-15T07:30:00Z'),
    labeled('task:status:running-agent', '2026-09-15T08:30:00Z'),
  ]);
  assert.deepEqual([...kinds].sort(), ['approval', 'failure']);
});

test('the cost records an item carries come back with the run that left them', () => {
  const costs = costsIn(TIMELINE);
  assert.equal(costs.length, 1);
  assert.equal(costs[0].runId, '77');
  assert.equal(costs[0].apiCalls, 31);
});

// --- the whole read ---------------------------------------------------------------

function fakeApi({ issues = [], timelines = {} } = {}) {
  const paths = [];
  const reader = {
    async json(path) {
      paths.push(path);
      let m;
      if (/^\/repos\/[^/]+\/[^/]+\/issues\?/.test(path)) {
        return Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1) === 1 ? issues : [];
      }
      if ((m = /\/issues\/(\d+)\/timeline/.exec(path))) {
        return Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1) === 1 ? (timelines[m[1]] ?? null) : [];
      }
      return null;
    },
  };
  return { paths, reader };
}

test('one item costs one timeline read, and answers all three questions from it', () => {
  // The reason this fold reads the timeline rather than the events listing the
  // session fold reads: labelings, comments and the close arrive together.
  const api = fakeApi({ issues: [ITEM], timelines: { 42: TIMELINE } });
  return readClosedItems({
    reader: api.reader, repo: 'o/r', since: '2026-09-15T00:00:00Z', now: NOW,
    schedulerRuns: [{ startedAt: '2026-09-15T05:10:00Z' }],
  }).then((read) => {
    assert.equal(api.paths.filter((p) => /\/timeline/.test(p)).length, 1);
    assert.equal(read.records.length, 1);
    const rec = read.records[0];
    assert.equal(rec.outcome, 'done');
    assert.deepEqual(rec.parks, []);
    assert.equal(rec.latency.itemToPickMinutes, 8);
    assert.equal(rec.costs[0].runId, '77');
    assert.equal(read.watermark, '2026-09-15T05:40:00Z');
  });
});

test('an item that closed at or before the mark is not counted a second time', async () => {
  const api = fakeApi({ issues: [ITEM], timelines: { 42: TIMELINE } });
  const read = await readClosedItems({
    reader: api.reader, repo: 'o/r', since: '2026-09-15T05:40:00Z', now: NOW,
  });
  assert.equal(read.records.length, 0);
  assert.equal(api.paths.filter((p) => /\/timeline/.test(p)).length, 0);
});

test('an unreadable timeline costs the item its parks and latency, never its outcome', async () => {
  const api = fakeApi({ issues: [ITEM], timelines: {} });
  const read = await readClosedItems({
    reader: api.reader, repo: 'o/r', since: '2026-09-15T00:00:00Z', now: NOW,
  });
  assert.equal(read.records[0].outcome, 'done');
  // Null, never `[]` or `{}` — an unknown park count stays distinguishable from a
  // run that needed nobody.
  assert.equal(read.records[0].parks, null);
  assert.equal(read.records[0].latency, null);
});

test('a pull request in the issues listing is not a work item', async () => {
  const api = fakeApi({ issues: [{ ...ITEM, pull_request: {} }] });
  const read = await readClosedItems({
    reader: api.reader, repo: 'o/r', since: '2026-09-15T00:00:00Z', now: NOW,
  });
  assert.equal(read.records.length, 0);
});
