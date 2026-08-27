// The grace window a newly-added check gets: a `blocking` rule that declares the
// date it was added is enforced as ADVISORY until GRACE_DAYS have passed, so a
// check can land against a tree that still violates it.
//
// The clock is injected at every assertion — a test that read the real one would
// pass today and fail in a fortnight, which is exactly the bug this window has.

import test from 'node:test';
import assert from 'node:assert/strict';

import { finding, applyGrace, applyConfig, graceUntil, render, GRACE_DAYS } from '../engine/checks/helpers/findings.mjs';
import { reportFindings } from '../engine/checks/report-findings.mjs';
import { patternRule } from '../engine/checks/helpers/pattern-rules.mjs';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso) => new Date(Date.parse(iso));
const emptyConfig = { rules: {}, accept: [] };

const blocking = (extra = {}) => finding(
  { id: 'newborn', severity: 'blocking', why: 'because', doc: null, ...extra },
  { file: 'a.mjs', what: 'it happened', fix: 'stop it' },
);

test('a blocking finding is advisory inside its rule\'s grace window, and blocking after', () => {
  const f = blocking({ since: '2026-08-27' });
  assert.equal(f.since, '2026-08-27');

  const inside = applyGrace([f], { now: at('2026-09-05T00:00:00Z') })[0];
  assert.equal(inside.severity, 'advisory');
  assert.equal(inside.graceUntil, '2026-09-10');

  const onTheDay = applyGrace([f], { now: at('2026-08-27T00:00:00Z') })[0];
  assert.equal(onTheDay.severity, 'advisory', 'the day it was added is inside the window');

  const after = applyGrace([f], { now: at('2026-09-10T00:00:00Z') })[0];
  assert.equal(after.severity, 'blocking', 'the window is half-open — day 14 bites');
  assert.equal(after.graceUntil, undefined);
});

test('the window is GRACE_DAYS long, measured from the declared date', () => {
  assert.equal(graceUntil('2026-08-27').getTime() - Date.parse('2026-08-27T00:00:00Z'), GRACE_DAYS * DAY);
});

test('no date, an unparseable date, or a future date grants no grace', () => {
  const now = at('2026-08-27T12:00:00Z');
  assert.equal(applyGrace([blocking()], { now })[0].severity, 'blocking');
  assert.equal(applyGrace([blocking({ since: 'last tuesday' })], { now })[0].severity, 'blocking');
  assert.equal(applyGrace([blocking({ since: '2099-01-01' })], { now })[0].severity, 'blocking');
  assert.equal(graceUntil(undefined), null);
  assert.equal(graceUntil('27-08-2026'), null);
});

test('an advisory finding is untouched — the window only ever demotes', () => {
  const f = finding({ id: 'soft', severity: 'advisory', since: '2026-08-27' }, { file: 'a.mjs', what: 'w', fix: 'f' });
  assert.equal(applyGrace([f], { now: at('2026-08-28T00:00:00Z') })[0].severity, 'advisory');
});

test('a project\'s own blocking override outranks the grace', () => {
  const f = blocking({ since: '2026-08-27' });
  const resolved = applyConfig(applyGrace([f], { now: at('2026-08-28T00:00:00Z') }), {
    rules: { newborn: 'blocking' }, accept: [],
  });
  assert.equal(resolved[0].severity, 'blocking');
});

test('the reporter does not fail the build over a finding inside its window, and says why', () => {
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(s);
  let count;
  try {
    count = reportFindings([blocking({ since: '2026-08-27' })], emptyConfig, {
      scopeLabel: 'world', mode: 'full', baseRef: null, now: at('2026-08-28T00:00:00Z'),
    });
  } finally { console.log = log; }
  assert.equal(count, 0, 'nothing blocking, so the runner exits 0');
  const printed = lines.join('\n');
  assert.match(printed, /Grace: added 2026-08-27 — advisory until 2026-09-10, blocking after/);
  assert.match(printed, /0 blocking, 1 advisory/);
});

test('the same finding fails the build once the window has passed', () => {
  const log = console.log;
  console.log = () => {};
  let count;
  try {
    count = reportFindings([blocking({ since: '2026-08-27' })], emptyConfig, {
      scopeLabel: 'world', mode: 'full', baseRef: null, now: at('2026-09-11T00:00:00Z'),
    });
  } finally { console.log = log; }
  assert.equal(count, 1);
});

test('render omits the grace line for a finding that has no window', () => {
  assert.doesNotMatch(render(blocking()), /Grace:/);
});

test('a declared check carries `since` onto the rule it compiles to', () => {
  const rule = patternRule({
    id: 'declared-with-a-date',
    severity: 'blocking',
    since: '2026-08-27',
    failureMessage: 'it matters',
    scanFiles: '/\\.mjs$/',
    matchLines: [{ match: '/nope/', what: 'says nope', fix: 'do not' }],
  });
  assert.equal(rule.since, '2026-08-27');
});

test('a malformed `since` is an authoring error, not a silently missing grace', () => {
  assert.throws(() => patternRule({
    id: 'declared-with-a-bad-date',
    severity: 'blocking',
    since: '27/08/2026',
    failureMessage: 'it matters',
    scanFiles: '/\\.mjs$/',
    matchLines: [{ match: '/nope/', what: 'says nope', fix: 'do not' }],
  }), /"since" is the date this check was added, as YYYY-MM-DD/);
});
