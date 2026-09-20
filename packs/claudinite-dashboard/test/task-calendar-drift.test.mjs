import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as page from '../src/derive/task-calendar.mjs';
import * as calendar from '../../claudinite-tasks/src/contract/calendar.mjs';
import * as anchors from '../../claudinite-tasks/src/items/anchors.mjs';

// THE DRIFT GUARD for `src/derive/task-calendar.mjs`, the dashboard's own copy of the
// queue's calendar arithmetic. The split is forced — packs share no code, and the page
// may talk to the queue only through its vocabulary — so the two copies are run over the
// same inputs, in both directions, and the first instant or declaration they answer
// differently fails here rather than on a rendered board.

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'];
// Every hour across a leap February, a month end and a year end.
const instants = [];
for (const start of [Date.UTC(2024, 1, 26), Date.UTC(2026, 2, 29), Date.UTC(2026, 11, 29)]) {
  for (let h = 0; h < 24 * 6; h += 1) instants.push(new Date(start + h * 3600e3));
}
const DECLARATIONS = [
  { preconditions: ['schedule:at-most-daily'] },
  { preconditions: ['schedule:at-most-weekly', 'last-run-not-failed'] },
  { preconditions: ['schedule:at-most-monthly || touched'] },
  // The retired spelling, which both copies still read: the page lifts a declaration
  // out of GitHub as text, so it meets it on any member that has not converged.
  { preconditions: ['due:daily'] }, { preconditions: ['touched || due:weekly'] },
  { preconditions: ['last-run-over:7d', 'last-run-not-parked'] }, { preconditions: ['touched'] },
  { preconditions: [] }, { preconditions: ['||'] }, {}, null,
];

test('the dashboard anchors every frequency exactly as the queue does', () => {
  const diffs = [];
  for (const f of FREQUENCIES) for (const now of instants) {
    const pairs = [
      ['mostRecentAnchor', page.mostRecentAnchor(f, now), anchors.mostRecentAnchor(f, now)],
      ['nextAnchor', page.nextAnchor(f, now), anchors.nextAnchor(f, now)],
    ];
    for (const [name, a, b] of pairs) if (String(a) !== String(b)) diffs.push(`${name}(${f}, ${now.toISOString()}): page ${a} queue ${b}`);
  }
  for (const f of FREQUENCIES) if (page.periodMs(f) !== anchors.periodMs(f)) diffs.push(`periodMs(${f})`);
  assert.deepEqual(diffs.slice(0, 5), [], `${diffs.length} disagreement(s)`);
});

test('the dashboard reads a cadence term exactly as the queue does', () => {
  const diffs = [];
  for (const decl of DECLARATIONS) {
    const p = decl?.preconditions;
    const pairs = [
      ['cadenceOf', page.cadenceOf(p), calendar.cadenceOf(p)],
      ['holdsOnFailure', page.holdsOnFailure(p), calendar.holdsOnFailure(p)],
      ['holdsOnAnyPark', page.holdsOnAnyPark(p), calendar.holdsOnAnyPark(p)],
      ['statesConditions', page.statesConditions(p), calendar.statesConditions(p)],
      ['taskPeriodMs', page.taskPeriodMs(decl), anchors.taskPeriodMs(decl)],
    ];
    for (const [name, a, b] of pairs) if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${name}(${JSON.stringify(decl)}): page ${JSON.stringify(a)} queue ${JSON.stringify(b)}`);
  }
  for (const f of FREQUENCIES) if (page.cadenceTermFor(f) !== calendar.cadenceTermFor(f)) diffs.push(`cadenceTermFor(${f})`);
  assert.deepEqual(diffs, []);
  assert.equal(page.DUE_TERM, calendar.DUE_TERM);
  assert.equal(page.SCHEDULE_TERM, calendar.SCHEDULE_TERM);
  assert.equal(page.AT_MOST_PREFIX, calendar.AT_MOST_PREFIX);
});
