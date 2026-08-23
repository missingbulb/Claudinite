import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleetGrowth } from '../fleet-growth.mjs';
import { decodeUsage } from '../usage.mjs';

const NOW = Date.parse('2026-08-21T11:30:00Z');
const dayKey = (msAgo) => new Date(NOW - msAgo).toISOString().slice(0, 10);

const FIELDS = {
  day: ['captures', 'merges', 'sessions', 'userMessages', 'userCommands', 'ruleTokens', 'ruleTokenSessions'],
  checks: ['runs', 'failures', 'errors', 'blocking', 'advisory', 'ciRuns', 'ciFailures'],
  checkFindings: ['blocking', 'advisory'],
};

// A member whose fold recorded `perDay` check runs and failures on each of the last
// `days` days.
const member = (repo, { days = 10, runs = 3, failures = 1, sessions = 2, ruleTokens = 16000 } = {}) => {
  const rows = {};
  for (let d = 0; d < days; d += 1) {
    rows[dayKey(d * 86400e3)] = {
      totals: [1, 1, sessions, 4, 0, ruleTokens * sessions, sessions],
      checks: { work: [runs, failures, 0, failures, 0, 0, 0] },
    };
  }
  return {
    repo,
    declaration: { packs: [] },
    usage: decodeUsage({ version: 3, generated: null, fields: FIELDS, days: rows, weeks: {}, hours: {} }),
  };
};

test('the fleet series sums the members that folded, per day', () => {
  const g = fleetGrowth([member('o/a'), member('o/b')], { now: NOW, days: 3 });
  assert.deepEqual(g.days.map((d) => d.day), [dayKey(2 * 86400e3), dayKey(86400e3), dayKey(0)]);
  assert.equal(g.days[2].checkRuns, 6, 'two members at three runs each');
  assert.equal(g.days[2].checkFailures, 2);
  assert.equal(g.folding, 2);
  assert.equal(g.members, 2);
});

test('a member that does not fold is NAMED, never averaged in as a quiet repo', () => {
  // The coverage census the retired fleet aggregate carried as `coverage.absent`,
  // derived live: a denominator with an invisible hole in it is worse than none.
  const g = fleetGrowth([
    member('o/folding'),
    { repo: 'o/quiet', declaration: { packs: [] }, usage: null },
    { repo: 'o/unreadable', error: { status: 404 } },
    { repo: 'o/not-adopted', declaration: null },
  ], { now: NOW, days: 3 });
  assert.equal(g.folding, 1);
  assert.equal(g.members, 2, 'a member the page could not read is in neither number');
  assert.deepEqual(g.absent, ['o/quiet']);
  assert.equal(g.days[2].checkRuns, 3, 'the non-folding member contributes nothing rather than zero');
});

test('a day nobody folded is null and marked, so the chart leaves it blank', () => {
  const g = fleetGrowth([member('o/a', { days: 1 })], { now: NOW, days: 3 });
  assert.equal(g.days[0].checkRuns, null);
  assert.equal(g.days[0].source, 'none');
  assert.equal(g.days[2].source, 'folded');
});

test('the window is measured against the window before it, never as a running total', () => {
  const g = fleetGrowth([member('o/a', { days: 20, runs: 2, failures: 1 })], { now: NOW, days: 20, windowDays: 7 });
  assert.equal(g.current.checkRuns, 14, 'seven days at two runs');
  assert.equal(g.previous.checkRuns, 14);
  assert.equal(g.current.checkFailures, 7);
});

test('the corpus a session carries is a mean, and null when nothing attested one', () => {
  const g = fleetGrowth([member('o/a', { days: 10, sessions: 2, ruleTokens: 16000 })], { now: NOW, days: 10 });
  assert.equal(g.tokensPerSession, 16000);

  const noSessions = fleetGrowth([{
    repo: 'o/b',
    declaration: { packs: [] },
    usage: decodeUsage({ version: 3, fields: FIELDS, days: { [dayKey(0)]: { totals: [1, 0, 0, 0, 0] } }, weeks: {}, hours: {} }),
  }], { now: NOW, days: 3 });
  assert.equal(noSessions.tokensPerSession, null, 'no session is not a corpus of zero');
});

test('a fleet where nothing folds reports that, rather than a fleet doing nothing', () => {
  const g = fleetGrowth([{ repo: 'o/a', declaration: { packs: [] }, usage: null }], { now: NOW, days: 3 });
  assert.equal(g.folding, 0);
  assert.equal(g.current.checkRuns, null);
  assert.ok(g.days.every((d) => d.source === 'none'));
});
