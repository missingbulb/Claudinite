import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closesIssueIn, hoursBetween, readMergedPrs, prRecordsFrom } from '../../../tasks/usage-fold/read-prs.mjs';
import { makeReader } from '../../../tasks/usage-fold/read-queue.mjs';

// PRs as the pulls API answers them.
const pr = (over = {}) => ({
  number: 1583,
  created_at: '2026-08-19T20:00:00Z',
  merged_at: '2026-08-20T10:00:00Z',
  body: 'does the thing\n\nCloses #1500\n',
  ...over,
});

function fakeGh(pages, issues = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const issue = /\/issues\/(\d+)/.exec(url)?.[1];
    if (issue) return { status: 200, json: async () => issues[issue] ?? null };
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    return { status: 200, json: async () => pages[page - 1] ?? [] };
  };
  return { reader: makeReader({ token: 't', api: 'https://api.test', fetchImpl }), calls };
}

test('the closing issue is the one the body names FIRST, on its own line', () => {
  assert.equal(closesIssueIn('work\n\nCloses #1500\nCloses #1501\n'), 1500);
  assert.equal(closesIssueIn('Fixes #7'), 7);
  assert.equal(closesIssueIn('  resolves #8  '), 8);
  // A cross-reference is not a closing keyword, and neither is a mention mid-sentence.
  assert.equal(closesIssueIn('Refs #1500'), null);
  assert.equal(closesIssueIn('this closes #1500 eventually'), null);
  assert.equal(closesIssueIn(''), null);
  assert.equal(closesIssueIn(null), null);
});

test('a span with an unknown end is null, and so is one whose ends disagree', () => {
  assert.equal(hoursBetween('2026-08-20T00:00:00Z', '2026-08-20T12:30:00Z'), 12.5);
  assert.equal(hoursBetween(null, '2026-08-20T12:30:00Z'), null, 'unknown is not zero');
  assert.equal(hoursBetween('2026-08-20T12:30:00Z', null), null);
  // Ends in the wrong order say the two clocks disagree, not that the work took less
  // than no time at all.
  assert.equal(hoursBetween('2026-08-20T12:30:00Z', '2026-08-20T00:00:00Z'), null);
});

test('readMergedPrs keeps merges past the mark, reads each closing issue once, and advances', async () => {
  const { reader, calls } = fakeGh(
    [[
      pr(),
      pr({ number: 1584, merged_at: '2026-08-20T12:00:00Z', body: 'no keyword here' }),
      pr({ number: 1585, merged_at: null }),                       // closed, never merged
      pr({ number: 1586, merged_at: '2026-08-19T10:00:00Z' }),     // already folded
    ]],
    { 1500: { created_at: '2026-08-18T20:00:00Z' } },
  );
  const out = await readMergedPrs({ reader, repo: 'o/r', since: '2026-08-20T00:00:00Z', now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.prs.map((p) => p.number), [1583, 1584]);
  assert.equal(out.prs[0].issueCreatedAt, '2026-08-18T20:00:00Z');
  assert.equal(out.prs[1].closesIssue, null);
  assert.equal(out.watermark, '2026-08-20T12:00:00Z', 'the newest merge, so nothing is read twice');
  // One listing page, and one narrow issue read — only for the PR that names an issue.
  assert.deepEqual(calls.filter((u) => u.includes('/issues/')).length, 1);
});

test('an unreadable listing costs the PR rows and leaves the mark alone', async () => {
  const reader = { json: async () => { throw new Error('network'); } };
  const out = await readMergedPrs({ reader, repo: 'o/r', since: '2026-08-20T00:00:00Z', now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.prs, []);
  assert.equal(out.watermark, '2026-08-20T00:00:00Z');
  assert.match(out.error, /could not be listed/);
});

test('the first read covers the day tier\'s width rather than the whole repo history', async () => {
  const { reader } = fakeGh([[pr({ merged_at: '2026-01-01T00:00:00Z' }), pr({ number: 9, merged_at: '2026-08-20T10:00:00Z' })]]);
  const out = await readMergedPrs({ reader, repo: 'o/r', since: null, now: '2026-08-21T11:00:00Z' });
  assert.deepEqual(out.prs.map((p) => p.number), [9], 'a merge older than the lookback is not this fold\'s business');
});

test('prRecordsFrom joins the listing to the session that did the work', () => {
  const files = [
    { date: '2026-08-19', stamp: '2026-08-19T18:00:00Z', issue: 1500, sessionId: 's1' },
    { date: '2026-08-19', stamp: '2026-08-19T21:00:00Z', issue: 1500, sessionId: 's1' },  // the tail capture
    { date: '2026-08-19', stamp: '2026-08-19T09:00:00Z', issue: 0, sessionId: 's2' },
  ];
  const [rec] = prRecordsFrom({
    prs: [{
      number: 1583, mergedAt: '2026-08-20T10:00:00Z', createdAt: '2026-08-19T20:00:00Z',
      closesIssue: 1500, issueCreatedAt: '2026-08-18T20:00:00Z',
    }],
    files,
  });
  assert.deepEqual(rec, {
    date: '2026-08-20',
    number: 1583,
    leadHours: 14,
    issueLeadHours: 38,
    // The EARLIEST capture naming the issue — when the work started, not when its tail
    // was written.
    sessionToMergeHours: 16,
  });
});

test('a PR whose issue never captured has no session lead time, and no zero', () => {
  const [rec] = prRecordsFrom({
    prs: [{ number: 9, mergedAt: '2026-08-20T10:00:00Z', createdAt: null, closesIssue: 1500, issueCreatedAt: null }],
    files: [],
  });
  assert.deepEqual(rec, { date: '2026-08-20', number: 9, leadHours: null, issueLeadHours: null, sessionToMergeHours: null });
});
