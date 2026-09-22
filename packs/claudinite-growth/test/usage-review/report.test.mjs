import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFile, dashboardValues, prBody, findingKey, daysBetween, LASTING_DAYS } from '../../tasks/usage-review/report.mjs';
import { filingsFor, closuresFor, issueTitle, issueBody, parseTitle } from '../../tasks/usage-review/issues.mjs';
import { buildWindow, windowDates, decodeRow, dayBefore } from '../../tasks/usage-review/read-record.mjs';

const finding = (over) => ({
  rule: 'skill-forced-only-small', subject: 'zzz-other-subject', pack: 'acme-pack',
  cause: 'known', causes: ['the guard does the loading'], open: false,
  finding: 'only ever loaded because a guard held a call', recommendation: 'carry the lines in the block text',
  figures: { skillBlocks: 11, skillLoads: 11, tokens: 190 },
  since: '2026-09-01', ...over,
});

const record = {
  foldedThrough: '2026-09-20',
  window: { from: '2026-08-24', to: '2026-09-20', daysCovered: 28 },
  previous: { from: '2026-07-27', to: '2026-08-23', daysCovered: 28 },
};
const build = (findings, over = {}) => reviewFile({
  record, findings, notEvaluated: [], unstated: [], skills: [{}], check: [{ proseTwin: false }], guard: [],
  today: '2026-09-21', ...over,
});

test('a finding is identified by the pair it is about, so rewording its rule keeps its age', () => {
  assert.equal(findingKey(finding()), findingKey(finding({ finding: 'rewritten', figures: {} })));
  assert.notEqual(findingKey(finding()), findingKey(finding({ subject: 'acme-skill' })));
});

test('a finding lasts once it has stood two weeks, counted from the review it first appeared in', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-21'), 20);
  const file = build([finding({ since: '2026-09-20' }), finding({ subject: 'other', since: '2026-09-07' })]);
  assert.deepEqual(file.findings.map((f) => f.lasting), [true, false], 'sorted by rule then subject: other, then the newer one');
  // Exactly ON the threshold is lasting — the day the gate is read is the ordinary case.
  const onIt = build([finding({ since: dayBefore('2026-09-21', LASTING_DAYS) })]);
  assert.equal(onIt.findings[0].lasting, true);
  const dayShort = build([finding({ since: dayBefore('2026-09-21', LASTING_DAYS - 1) })]);
  assert.equal(dayShort.findings[0].lasting, false);
});

test('an issue is filed only for a lasting finding whose cause is worth reading', () => {
  const file = build([
    finding({ subject: 'a', since: '2026-09-01', cause: 'known' }),
    finding({ subject: 'b', since: '2026-09-01', cause: 'probable' }),
    finding({ subject: 'c', since: '2026-09-01', cause: 'unknown' }),
    finding({ subject: 'd', since: '2026-09-20', cause: 'known' }),
  ]);
  assert.deepEqual(filingsFor(file).map((f) => f.subject), ['a', 'b'],
    'an unknown cause is evidence, and a young finding is weather');
});

test('an issue that no longer has a finding is closed, and an unrelated issue is left alone', () => {
  const file = build([finding({ subject: 'still-here' })]);
  // Built through the renderer, not spelled out: the title is a wire format between
  // this run and the issues an earlier one filed, so a test that spells it a second
  // way can agree with itself while the two halves drift apart.
  const gone = issueTitle({ rule: 'check-never-fires', subject: 'gone-check' });
  const open = [issueTitle(finding({ subject: 'still-here' })), gone, 'Something else entirely'];
  assert.deepEqual(closuresFor(file, open).map((c) => c.subject), ['gone-check']);
  assert.deepEqual(parseTitle(gone), { rule: 'check-never-fires', subject: 'gone-check' });
});

test('the issue body carries the figures, the causes and what it is not', () => {
  const file = build([finding()]);
  const body = issueBody(file.findings[0], file);
  assert.match(body, /skillBlocks`: 11/);
  assert.match(body, /closed by the mechanism/, 'a closed cause list says so, rather than inviting a fourth');
  assert.match(body, /changes nothing/);
  assert.match(body, /20 days/, 'the age is derived, so a stale issue reads as stale');
  // A figure the record did not carry says so rather than reading as a zero.
  const unknown = build([finding({ figures: { skillBlocks: null } })]);
  assert.match(issueBody(unknown.findings[0], unknown), /skillBlocks`: \*not recorded\*/);
});

test('an open cause list invites a cause outside it; a closed one does not', () => {
  const file = build([finding({ open: true, causes: ['the pattern is too broad'] })]);
  assert.match(issueBody(file.findings[0], file), /only what its authors thought of/);
});

test('the dashboard reports this window against the one before, never a running total', () => {
  const now = build([finding(), finding({ subject: 'b' })]);
  const values = dashboardValues(now, build([finding()]));
  assert.equal(values['usage-findings'].value, 2);
  assert.equal(values['usage-findings'].previous, 1);
  assert.equal(values['usage-newest'].rows.length, 2);
  assert.equal(dashboardValues(now, null)['usage-findings'].previous, null, 'a first run has no previous, which is not a zero');
});

test('no findings is a result only when nothing went unevaluated', () => {
  const clean = build([], { notEvaluated: [] });
  assert.match(prBody(clean), /every rule was evaluated/);
  const young = build([], { notEvaluated: [{ rule: 'r', subject: 's', name: 'sessions', need: 10, have: 4 }] });
  assert.match(prBody(young), /not yet a clean window/);
  assert.match(prBody(young), /not evaluated/i);
});

test('the pull request body groups by how well the cause is known', () => {
  const body = prBody(build([finding({ cause: 'known' }), finding({ subject: 'b', cause: 'unknown' })]));
  assert.ok(body.indexOf('Cause known') < body.indexOf('Cause unknown'), 'the actionable half is read first');
  assert.match(body, /zzz-other-subject/);
});

test('the window ends yesterday, because today is still arriving', () => {
  const dates = windowDates('2026-09-21');
  assert.equal(dates.length, 28);
  assert.equal(dates.at(-1), '2026-09-20');
  assert.equal(dates[0], '2026-08-24');
  // …and the previous window abuts it without overlapping.
  const before = windowDates('2026-09-21', 1);
  assert.equal(before.at(-1), '2026-08-23');
  assert.equal(before.length, 28);
});

test('a window is built off the FILE\'s own header, and a day the file lacks is not a day of zeroes', () => {
  const file = {
    fields: { day: ['captures', 'sessions'], checkFindings: ['blocking', 'advisory'] },
    days: {
      '2026-09-20': { totals: [4, 2], skillLoads: { a: 3 }, checkFindings: { 'r-1': [1, 0] } },
      '2026-09-19': { totals: [2, 1] },
    },
  };
  const w = buildWindow(file, '2026-09-21');
  assert.equal(w.daysCovered, 2, 'the 26 days the file says nothing about are absent, not empty');
  assert.deepEqual(w.days[1], { captures: 4, sessions: 2, skillLoads: { a: 3 }, checkFindings: { 'r-1': { blocking: 1, advisory: 0 } } });
  assert.equal(w.carriesCheckFindings, true);
  assert.equal(buildWindow({ fields: {}, days: {} }, '2026-09-21').carriesCheckFindings, false);
});

test('a tuple slot the file left null yields no key, whatever this code\'s own vocabulary is', () => {
  const row = decodeRow({ totals: [4, null], guardFires: { g: [2] } },
    ['captures', 'sessions'], { guardFires: ['blocking', 'advisory'] });
  assert.deepEqual(row, { captures: 4, guardFires: { g: { blocking: 2 } } },
    'sessions and advisory are unknown, and neither is 0');
});
