import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  axisOf, edgesOf, componentsOf, placeItem, prWaits, scheduleGrid, workloadLine,
  quietTail, buildBoard, DAYS_BACK, DAYS_AHEAD, GROUP_CAP, ROT_DAYS, nextDailyAnchor,
} from '../board.mjs';
import {
  WORK_PREFIX, ORIGIN_AD_HOC, STATUS_READY, STATUS_RUNNING_AGENT,
  NEEDS_HUMAN_FAILURE, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_ACTION, OUTCOME_DONE, OUTCOME_OBSOLETE,
  MACHINE_BLOCK_START, MACHINE_BLOCK_END,
} from '../../claudinite-tasks/shared-code/work-items.mjs';

const NOW = Date.parse('2026-09-02T10:30:00Z');
const DAY = 86400e3;
const SCHEDULE = { dailyHour: 5, weeklyDay: 'Sun', monthlyDay: 1 };
const iso = (t) => new Date(t).toISOString();

const body = (lines = []) => `${MACHINE_BLOCK_START}\npacks/p/tasks/t/task.mjs\n${lines.join('\n')}\n${MACHINE_BLOCK_END}`;
const item = (over = {}) => ({
  number: 10, title: `${WORK_PREFIX} p/t`, state: 'open', labels: [{ name: ORIGIN_AD_HOC }],
  body: body(), created_at: iso(NOW - 3 * DAY), updated_at: iso(NOW - 3 * DAY), ...over,
});
const plain = (over = {}) => ({
  number: 90, title: 'someone typed this', state: 'open', labels: [], body: '',
  created_at: iso(NOW - 30 * DAY), updated_at: iso(NOW - 30 * DAY), ...over,
});
const pr = (over = {}) => ({ number: 200, title: 'a change', created_at: iso(NOW - 2 * DAY), merged_at: null, closesIssue: null, ...over });
const labelled = (...names) => names.map((name) => ({ name }));

// --- the axis --------------------------------------------------------------------------

test('the axis is seven back, today and four ahead, each with the repo\'s own anchor', () => {
  const axis = axisOf(NOW, SCHEDULE);
  assert.equal(axis.days.length, DAYS_BACK + 1 + DAYS_AHEAD);
  assert.equal(axis.days.filter((d) => d.today).length, 1);
  assert.equal(axis.days.filter((d) => d.past).length, DAYS_BACK);
  // Four ahead is the honest horizon: past it every prediction is the same daily tick
  // again, and seven back is the week the ledger above compares.
  assert.equal(axis.days.filter((d) => d.future).length, DAYS_AHEAD);
  assert.equal(new Date(axis.days[0].anchorAt).toISOString().slice(11, 13), '05');
});

// --- the edge graph ---------------------------------------------------------------------

test('edges run from the thing that WAITS to the thing it waits on', () => {
  const edges = edgesOf(
    [item({ number: 10, body: body(['Blocked-by: #11', 'Ends-when: #12 closed']) })],
    [pr({ number: 200, closesIssue: 13 })],
  );
  assert.deepEqual(edges, [
    { from: 10, to: 11, kind: 'blocked-by' },
    { from: 10, to: 12, kind: 'ends-when' },
    { from: 'pr:200', to: 13, kind: 'closes' },
  ]);
});

test('a lane is a connected COMPONENT, so a chain is one row and a lone item is one too', () => {
  const parts = componentsOf([1, 2, 3, 4], [{ from: 1, to: 2 }, { from: 2, to: 3 }]);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.find((p) => p.includes(1)).sort(), [1, 2, 3]);
  assert.deepEqual(parts.find((p) => p.includes(4)), [4]);
});

// --- where a mark sits -------------------------------------------------------------------

const place = (it, extra = {}) => placeItem(it, {
  now: NOW, axis: axisOf(NOW, SCHEDULE), byNumber: new Map(), moversByNumber: new Map(), ...extra,
});

test('a stamped Not-before IS the schedule, and wins over everything computed', () => {
  const at = iso(NOW + 2 * DAY);
  const out = place(item({ body: body([`Not-before: ${at}`]) }));
  assert.equal(out.at, Date.parse(at));
  assert.equal(out.kind, 'blocked-date');
});

test('a relative Not-before is FLAGGED, never guessed', () => {
  // A date a person meant and the parser does not read is a date the machine will
  // treat as absent — which is worth saying, and never worth inventing.
  const out = place(item({ body: body(['Not-before: next Tuesday']) }));
  assert.equal(out.at, null);
  assert.equal(out.flagged, true);
  assert.match(out.why, /relative date/);
});

test('a blocker a PR closes puts the item at NOW — a person\'s move, not a date', () => {
  const out = place(item({ body: body(['Blocked-by: #11']) }), {
    moversByNumber: new Map([[11, { kind: 'pr', number: 200 }]]),
  });
  assert.equal(out.at, NOW);
  assert.match(out.why, /when you merge PR #200/);
});

test('a plain issue nobody is scheduled to close BREAKS the lane — no time at all', () => {
  const out = place(item({ body: body(['Blocked-by: #90']) }), {
    byNumber: new Map([[90, plain({ number: 90 })]]),
  });
  assert.equal(out.at, null);
  assert.equal(out.broken, true);
  assert.equal(out.blocker, 90);
  assert.match(out.why, /no one is scheduled to close #90/);
});

test('a ready item sits at the next scheduler tick, and a park and a run sit at now', () => {
  assert.equal(place(item({ labels: labelled(ORIGIN_AD_HOC, STATUS_READY) })).at, nextDailyAnchor(NOW, axisOf(NOW, SCHEDULE)));
  assert.equal(place(item({ labels: labelled(NEEDS_HUMAN_ACTION) })).kind, 'park');
  assert.equal(place(item({ labels: labelled(STATUS_RUNNING_AGENT) })).kind, 'running');
});

test('an item on no queue mark says nothing will pick it up', () => {
  const out = place(item({ labels: [] }));
  assert.equal(out.kind, 'unmarked');
  assert.equal(out.flagged, true);
});

// --- why a PR waits ----------------------------------------------------------------------

test('three different reasons a PR waits, told apart', () => {
  // One amber flag on the board; the panel says which, because the reader's next move
  // differs for each.
  assert.match(prWaits(pr(), { item: null }).why, /no work item names this PR/);
  assert.match(prWaits(pr(), { item: item(), declaration: { automerge: 'nothing', key: 'p/t' } }).why, /automerge: nothing/);
  assert.match(prWaits(pr(), { item: item({ body: body([]) }) }).why, /carries no Merge policy/);
  const lands = prWaits(pr(), { item: item({ body: body(['Merge: generated-file-changes']) }), declaration: { automerge: 'x' } });
  assert.equal(lands.waits, false);
  assert.match(lands.notRead, /has not fetched/);
});

// --- the schedule grid --------------------------------------------------------------------

const taskRow = (over = {}) => ({
  key: 'p/t', pack: 'p', task: 't', frequency: 'daily', declaration: { frequency: 'daily' },
  nextAsk: { kind: 'anchor', at: new Date(NOW + DAY) }, lastClosed: null, ...over,
});

test('a cell is read off the item that closed, parked or ran that day', () => {
  const axis = axisOf(NOW, SCHEDULE);
  const yesterday = iso(NOW - DAY);
  const grid = scheduleGrid([taskRow()], [
    item({ number: 1, state: 'closed', closed_at: yesterday, labels: labelled(OUTCOME_DONE) }),
    item({ number: 2, state: 'closed', closed_at: iso(NOW - 2 * DAY), labels: labelled(OUTCOME_OBSOLETE) }),
  ], axis, { now: NOW, schedule: SCHEDULE });
  const cells = grid[0].cells;
  assert.equal(cells.find((c) => c.day === yesterday.slice(0, 10)).state, 'ran');
  assert.equal(cells.find((c) => c.day === iso(NOW - 2 * DAY).slice(0, 10)).state, 'declined');
});

test('A FAILURE PARK LANDS ON ITS OWN TASK\'S ROW, and the later cells are the record disagreeing', () => {
  // The roster reads such a park as holding the task's lane. A hatched cell followed by
  // filled ones is that claim being disproved, read left to right on one line — which
  // is why there is no separate held-lanes row.
  const axis = axisOf(NOW, SCHEDULE);
  const grid = scheduleGrid([taskRow()], [
    item({ number: 1, labels: labelled(NEEDS_HUMAN_FAILURE), updated_at: iso(NOW - 3 * DAY) }),
    item({ number: 2, state: 'closed', closed_at: iso(NOW - DAY), labels: labelled(OUTCOME_DONE) }),
  ], axis, { now: NOW, schedule: SCHEDULE });
  const cells = grid[0].cells;
  assert.equal(cells.find((c) => c.day === iso(NOW - 3 * DAY).slice(0, 10)).state, 'failure-park');
  assert.equal(cells.find((c) => c.day === iso(NOW - DAY).slice(0, 10)).state, 'ran');
});

test('a future cell is predicted, and half-height where the last verdict declined', () => {
  const axis = axisOf(NOW, SCHEDULE);
  const predicted = scheduleGrid([taskRow()], [], axis, { now: NOW, schedule: SCHEDULE })[0].cells;
  assert.ok(predicted.some((c) => c.state === 'predicted'));
  const declining = scheduleGrid([taskRow({ lastClosed: { outcome: 'obsolete' } })], [], axis, { now: NOW, schedule: SCHEDULE })[0].cells;
  // Told apart by HEIGHT, never a dash pattern, which at three pixels is invisible.
  assert.ok(declining.some((c) => c.state === 'will-decline'));
});

test('everything on a longer cadence is one row — the question is whether it fired at all', () => {
  const axis = axisOf(NOW, SCHEDULE);
  const grid = scheduleGrid(
    [taskRow(), taskRow({ key: 'p/w', task: 'w', frequency: 'weekly', declaration: { frequency: 'weekly' } })],
    [], axis, { now: NOW, schedule: SCHEDULE },
  );
  assert.equal(grid.length, 2);
  assert.match(grid[1].task, /longer cadence/);
});

// --- the workload line ---------------------------------------------------------------------

test('tomorrow\'s workload is the declarations read against the schedule, never a guess', () => {
  const line = workloadLine(21, [
    taskRow({ key: 'p/promote', task: 'promote', declaration: { automerge: 'nothing' } }),
    taskRow({ key: 'p/quiet', task: 'quiet', declaration: { automerge: 'generated-file-changes' } }),
  ], { schedule: SCHEDULE, now: NOW });
  assert.match(line, /21 open PRs/);
  assert.match(line, /every one waits for a person/);
  assert.match(line, /\+1 a day from promote/);
  assert.doesNotMatch(line, /quiet/, 'a task that lands its own PR adds nothing to your day');
});

// --- the quiet tail --------------------------------------------------------------------------

test('the quiet tail counts the plain issues on NO edge, by what matters', () => {
  const issues = [
    plain({ number: 90 }),
    plain({ number: 91, labels: labelled('quick-win'), updated_at: iso(NOW - DAY) }),
    plain({ number: 92, labels: labelled('needs-decision'), updated_at: iso(NOW - DAY) }),
    plain({ number: 93 }),
  ];
  const quiet = quietTail(issues, [{ from: 10, to: 93 }], NOW);
  assert.equal(quiet.total, 3, 'the one on an edge is a lane, not a quiet issue');
  assert.equal(quiet.rotting, 1);
  assert.equal(quiet.quickWin, 1);
  assert.equal(quiet.needsDecision, 1);
  assert.equal(ROT_DAYS, 14);
});

// --- the whole board ---------------------------------------------------------------------------

test('the board caps each group at its worst rows and NAMES what it is holding back', () => {
  const prs = Array.from({ length: 9 }, (_, i) => pr({ number: 300 + i, created_at: iso(NOW - (9 - i) * DAY) }));
  const board = buildBoard({ rows: [], items: [], prs, now: NOW, schedule: SCHEDULE });
  const now = board.groups.find((g) => g.id === 'now');
  assert.equal(now.shown.length, GROUP_CAP);
  assert.equal(now.more, 9 - GROUP_CAP);
  assert.equal(now.count, 9);
  // Oldest first: a PR that has waited longest is the worst row in the group.
  assert.equal(now.shown[0].gutter, '#300');
});

test('a merged PR is not on the board — the Now group is what waits', () => {
  const board = buildBoard({ rows: [], items: [], prs: [pr({ merged_at: iso(NOW - DAY) })], now: NOW, schedule: SCHEDULE });
  assert.equal(board.groups.find((g) => g.id === 'now').count, 0);
});

test('a broken lane sorts to the top of Flows and carries its finding as text', () => {
  const items = [
    item({ number: 10, body: body(['Blocked-by: #90']) }),
    item({ number: 11, body: body([`Not-before: ${iso(NOW + DAY)}`]) }),
    plain({ number: 90 }),
  ];
  const board = buildBoard({ rows: [], items, prs: [], now: NOW, schedule: SCHEDULE });
  const flows = board.groups.find((g) => g.id === 'flows');
  assert.equal(flows.shown[0].gutter, '#10');
  assert.equal(flows.shown[0].broken, true);
  assert.match(flows.shown[0].finding, /no one is scheduled to close #90/);
  // A future Not-before is the mechanism working, not a break.
  assert.equal(flows.shown[1].broken, false);
  assert.equal(flows.shown[1].finding, null);
});
