import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sumKnown, quantile, fleetDays, windowsOf, mergedPrsIn, stuckItems, closedItems,
  figure, totalsOf, pulseOf, memberWindow, machinePanel, hourKeysSince, fmtAge, fmtTokens,
  fleetLedger, SCHEDULER_CADENCE_MS,
} from '../fleet-ledger.mjs';
import { WORK_PREFIX, OUTCOME_DONE, NEEDS_HUMAN_APPROVAL } from '../../claudinite-tasks/shared-code/work-items.mjs';

const NOW = Date.parse('2026-09-02T12:00:00Z');
const DAY = 86400e3;
const day = (back) => new Date(NOW - back * DAY).toISOString().slice(0, 10);

// A member's decoded fold: the day rows the ledger reduces over.
const folder = (repo, rows, over = {}) => ({
  repo, declaration: { packs: [] }, items: [], prs: [], usage: { days: rows, hours: {}, generated: null }, ...over,
});

test('a sum over nothing is UNKNOWN, not zero', () => {
  // The whole point of the fold's absence rule is lost the moment a page adds up an
  // empty list and prints the total.
  assert.equal(sumKnown([]), null);
  assert.equal(sumKnown([null, undefined]), null);
  assert.equal(sumKnown([3, null, 4]), 7, 'and a partial answer is the part that knew');
  assert.equal(sumKnown([0]), 0, 'a real zero survives');
});

test('a quantile is by nearest rank, and null over an empty sample', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.9), 5);
  assert.equal(quantile([4], 0.5), 4);
  assert.equal(quantile([], 0.5), null, 'a median of nothing is not zero');
});

test('fleetDays sums what knew and leaves the rest unknown', () => {
  const rows = fleetDays([
    folder('o/a', { [day(1)]: { sessions: 3, tokensIn: 10 } }),
    folder('o/b', { [day(1)]: { sessions: 2 } }),
  ], { now: NOW, days: 3 });
  const yesterday = rows.find((r) => r.day === day(1));
  assert.equal(yesterday.sessions, 5);
  assert.equal(yesterday.tokensIn, 10, 'the member that knew is the answer, not an average');
  assert.equal(yesterday.humanSeconds, null, 'nobody folded it — unknown, never 0');
  assert.deepEqual(yesterday.movedBy, ['o/a', 'o/b']);
  const today = rows.find((r) => r.day === day(0));
  assert.equal(today.folded, false);
  assert.equal(today.sessions, null);
});

test('the two windows are seven days and the seven before them', () => {
  const rows = fleetDays([], { now: NOW, days: 14 });
  const w = windowsOf(rows, { now: NOW });
  assert.equal(w.current.length, 7);
  assert.equal(w.previous.length, 7);
  assert.equal(w.to, day(0));
  assert.equal(w.from, day(6));
  assert.equal(w.prevTo, day(7));
});

// --- merged pull requests ------------------------------------------------------------

test('a merged PR seen live is joined to the issue it closes, in the same read', () => {
  const read = {
    repo: 'o/a',
    items: [{ number: 100, created_at: '2026-08-30T00:00:00Z' }],
    prs: [{ number: 7, merged_at: '2026-09-01T12:00:00Z', created_at: '2026-09-01T00:00:00Z', closesIssue: 100 }],
  };
  const rows = fleetDays([], { now: NOW, days: 14 });
  const [pr] = mergedPrsIn([read], rows);
  assert.equal(pr.leadHours, 12);
  assert.equal(pr.issueLeadHours, 60, 'which is what makes issue → merged answerable before the fold folds it');
  assert.equal(pr.sessionToMergeHours, null, 'nothing live can answer that one');
});

test('the fold\'s row WINS over the live one — it is the fuller record', () => {
  const read = {
    repo: 'o/a', items: [],
    prs: [{ number: 7, merged_at: `${day(1)}T12:00:00Z`, created_at: `${day(2)}T12:00:00Z`, closesIssue: null }],
  };
  const rows = fleetDays([folder('o/a', {
    [day(1)]: { prs: { 7: { leadHours: 24, issueLeadHours: 60, sessionToMergeHours: 0.7 } } },
  })], { now: NOW, days: 14 });
  const out = mergedPrsIn([read], rows);
  assert.equal(out.length, 1, 'one PR, not two — the two sources overlap by design');
  assert.equal(out[0].sessionToMergeHours, 0.7);
  assert.equal(out[0].source, 'fold');
});

test('a PR that never merged, or merged outside the window, is not this window\'s', () => {
  const rows = fleetDays([], { now: NOW, days: 14 });
  const read = {
    repo: 'o/a', items: [],
    prs: [
      { number: 1, merged_at: null, created_at: `${day(1)}T00:00:00Z` },
      { number: 2, merged_at: '2026-01-01T00:00:00Z', created_at: '2025-12-31T00:00:00Z' },
    ],
  };
  assert.deepEqual(mergedPrsIn([read], rows), []);
});

// --- what is stuck, and what closed --------------------------------------------------

const item = (over = {}) => ({
  number: 5, title: `${WORK_PREFIX} basics/baselining`, state: 'open', labels: [],
  created_at: '2026-08-01T00:00:00Z', updated_at: new Date(NOW - 5 * DAY).toISOString(), ...over,
});

test('stuck items are split by WHO clears them', () => {
  // The split is the point: a person clears a park and the janitor's leash clears the
  // rest, so only the first half is a claim on the reader's morning.
  const out = stuckItems([{ repo: 'o/a', items: [
    item({ number: 1, labels: [{ name: NEEDS_HUMAN_APPROVAL }] }),
    item({ number: 2 }),
    item({ number: 3, updated_at: new Date(NOW - 1 * DAY).toISOString() }),
    item({ number: 4, state: 'closed' }),
    item({ number: 5, title: 'someone typed this' }),
  ] }], NOW);
  assert.deepEqual(out.forYou.map((i) => i.number), [1]);
  assert.deepEqual(out.onMachine.map((i) => i.number), [2]);
  assert.equal(out.total, 2);
});

test('closed items count what completed, and what completed untouched', () => {
  const closed = (over) => item({ state: 'closed', closed_at: `${day(2)}T00:00:00Z`, labels: [{ name: OUTCOME_DONE }], ...over });
  const out = closedItems([{ repo: 'o/a', items: [
    closed({ number: 1 }),
    closed({ number: 2, labels: [{ name: OUTCOME_DONE }, { name: NEEDS_HUMAN_APPROVAL }] }),
    closed({ number: 3, closed_at: '2026-01-01T00:00:00Z' }),
  ] }], day(6), day(0));
  assert.equal(out.completed, 2, 'the one outside the window is not this window\'s');
  assert.equal(out.unattended, 1, 'an item closed while parked is one a person had to touch');
});

// --- the figure's three states -------------------------------------------------------

test('a figure with no value carries the SENTENCE saying why, not a dash', () => {
  const f = figure(null, 5, { unit: 'tokens in', gap: 'not recorded — this fold predates it' });
  assert.equal(f.value, null);
  assert.equal(f.delta, null, 'and no delta against a number it cannot be compared to');
  assert.match(f.gap, /predates/);
  assert.equal(f.bad, false, 'a gap is never a verdict');
});

test('a delta needs both ends, and a tint needs the figure\'s own bad-when to fire', () => {
  assert.equal(figure(4, 10, { unit: 'x' }).delta, -6);
  assert.equal(figure(4, null, { unit: 'x' }).delta, null, 'nothing to compare against');
  assert.equal(figure(4, 10, { unit: 'x' }).bad, false, 'a merely-down week is a figure, not a verdict');
  assert.equal(figure(4, 10, { unit: 'x', bad: true }).bad, true);
});

test('a quotient INHERITS both its inputs\' gaps', () => {
  // A headline resting on a hole is worse than a stated gap, so a numerator or
  // denominator that is not recorded makes the quotient not recorded.
  const t = totalsOf({
    merged: [], closed: { completed: 0, unattended: 0 }, stuck: { forYou: [] },
    priced: { usd: null }, cur: () => null,
  });
  assert.equal(t.costPerMerged, null);
  assert.equal(t.tokensPerMerged, null);
  assert.equal(t.autonomy, null, 'nothing closed — not 0% autonomous');
  assert.equal(t.humanToAgent, null);
});

test('the totals divide where both ends are real', () => {
  const t = totalsOf({
    merged: [{}, {}, {}, {}], closed: { completed: 10, unattended: 8 }, stuck: { forYou: [1] },
    priced: { usd: 40 },
    cur: (f) => ({ tokensIn: 4e9, humanSeconds: 100, agentSeconds: 2400, caught: 7 }[f] ?? null),
  });
  assert.equal(t.costPerMerged, 10);
  assert.equal(t.tokensPerMerged, 1e9);
  assert.equal(t.autonomy, 0.8);
  assert.equal(t.humanToAgent, 24);
});

// --- the pulse -----------------------------------------------------------------------

test('the pulse marks today as its own state, and leaves an unfolded day blank', () => {
  const rows = fleetDays([folder('o/a', { [day(1)]: { sessions: 4 }, [day(9)]: { sessions: 2 } })], { now: NOW, days: 14 });
  const p = pulseOf(rows, windowsOf(rows, { now: NOW }));
  assert.equal(p.days.find((d) => d.day === day(0)).series, 'today');
  assert.equal(p.days.find((d) => d.day === day(1)).series, 'current');
  assert.equal(p.days.find((d) => d.day === day(9)).series, 'previous');
  assert.equal(p.days.find((d) => d.day === day(5)).sessions, null, 'nobody folded it — a blank, never a floor');
  assert.equal(p.peak, 4);
});

// --- the machine ---------------------------------------------------------------------

const summary = (repo, runs, over = {}) => ({ repo, status: 'adopted', declaredTasks: 2, runs, mount: { state: 'current' }, ...over });

test('the heartbeat is green inside cadence, amber past twice it, and critical on never', () => {
  const m = machinePanel([
    summary('o/fresh', { everRan: true, lastAt: NOW - 10 * 60e3, lastAtSource: 'live', inFlight: 0 }),
    summary('o/late', { everRan: true, lastAt: NOW - 3 * SCHEDULER_CADENCE_MS, lastAtSource: 'folded', inFlight: 0 }),
    summary('o/never', { everRan: false, lastAt: null, inFlight: 0 }),
  ], [], { now: NOW });
  assert.deepEqual(m.heartbeat.beats.map((b) => b.level), ['good', 'you', 'critical']);
  assert.equal(m.heartbeat.level, 'critical', 'the worst square is the cell\'s verdict');
  assert.equal(m.heartbeat.onTime, 1);
  assert.match(m.heartbeat.note, /late/);
  assert.match(m.heartbeat.note, /never/);
  assert.match(m.heartbeat.beats[1].title, /to the hour/, 'a folded answer says how precise it is');
});

test('the next wake states an ABSENCE rather than drawing an empty 24 hours', () => {
  // An empty strip reads as "nothing wakes", which is the serious verdict. The anchors
  // live in declarations this page does not fetch, and the difference has to be said.
  const m = machinePanel([summary('o/a', { everRan: true, lastAt: NOW, inFlight: 0 })], [], { now: NOW, strip: null });
  assert.equal(m.wake.read, false);
  assert.equal(m.wake.level, 'none');
  assert.match(m.wake.note, /not read/);
});

test('a strip that IS read, with nothing in it, is the serious verdict', () => {
  const m = machinePanel([summary('o/a', { everRan: true, lastAt: NOW, inFlight: 0 })], [],
    { now: NOW, strip: { peak: 0, hours: [], from: null } });
  assert.equal(m.wake.level, 'serious');
  assert.match(m.wake.note, /nothing wakes/);
});

test('drift is UNKNOWN with no canon, and never read as current', () => {
  const m = machinePanel([summary('o/a', { everRan: true, lastAt: NOW, inFlight: 0 })], [], { now: NOW, canon: null });
  assert.equal(m.drift.behind, null);
  assert.match(m.drift.note, /unknown/);
});

test('the executor cell reads the fold\'s own hour tier over the last 24', () => {
  const hours = Object.fromEntries(hourKeysSince(NOW, 3).map((h, i) => [h, { executor: 2, failed: i === 0 ? 1 : 0 }]));
  const m = machinePanel(
    [summary('o/a', { everRan: true, lastAt: NOW, inFlight: 2 })],
    [{ repo: 'o/a', usage: { hours } }],
    { now: NOW },
  );
  assert.equal(m.executor.failed, 1);
  assert.equal(m.executor.runs, 6);
  assert.equal(m.executor.inFlight, 2);
  assert.equal(m.executor.level, 'you');
});

test('memberWindow answers null per field, never 0, where that member could not', () => {
  const rows = fleetDays([], { now: NOW, days: 14 });
  const w = windowsOf(rows, { now: NOW });
  const m = memberWindow(folder('o/a', { [day(1)]: { sessions: 3, ruleTokens: 3000, ruleTokenSessions: 2 } }), w);
  assert.equal(m.sessions, 3);
  assert.equal(m.tokensIn, null, 'a member folding without token records spent an unknown amount, not nothing');
  assert.equal(m.tokensPerSession, 1500);
});

test('fmtAge and fmtTokens keep a figure short without inventing precision', () => {
  assert.equal(fmtAge(null), 'never');
  assert.equal(fmtAge(30e3), '<1m');
  assert.equal(fmtAge(90 * 60e3), '1h 30m');
  assert.equal(fmtTokens(3.2e9), '3.2B');
  assert.equal(fmtTokens(null), 'not recorded');
});

test('the whole block reads a fleet where nothing folds without inventing a figure', () => {
  const out = fleetLedger([{ repo: 'o/a', declaration: { packs: [] }, usage: null, items: [], prs: [] }], { now: NOW });
  assert.equal(out.window.folding, 0);
  assert.deepEqual(out.window.absent, ['o/a']);
  for (const column of Object.values(out.ledger)) {
    for (const f of column) {
      if (f.value === null) assert.ok(f.gap, `${f.unit} must say WHY it has no number`);
    }
  }
  assert.equal(out.pulse.peak, null);
});
