import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { runRule as dispatch } from '../../engine/checks/helpers/work.mjs';
import planTrackingFreshness from './plan-tracking-freshness.mjs';

const OWNER = 'missingbulb', REPO = 'claudinite';

// Transcript entry constructors — the MCP tool_use / tool_result shapes the rule
// reads (assistant emits tool_use; the result comes back as a user tool_result).
const merge = (pr, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: `m-${pr}-${ts}`, name: 'mcp__github__merge_pull_request', input: { owner: OWNER, repo: REPO, pullNumber: pr, merge_method: 'squash' } }] },
});
const listTrackers = (id, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'mcp__github__list_issues', input: { owner: OWNER, repo: REPO, labels: ['plan-tracking'], state: 'OPEN' } }] },
});
const listResult = (id, nums, ts) => ({
  type: 'user', timestamp: ts,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: JSON.stringify(nums.map((n) => ({ number: n, title: `tracker ${n}` }))) }] },
});
const issueUpdate = (num, body, ts, labels) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: `u-${num}-${ts}`, name: 'mcp__github__issue_write', input: { method: 'update', owner: OWNER, repo: REPO, issue_number: num, body, ...(labels ? { labels } : {}) } }] },
});
const issueComment = (num, body, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: `c-${num}-${ts}`, name: 'mcp__github__add_issue_comment', input: { owner: OWNER, repo: REPO, issue_number: num, body } }] },
});

const T = {
  before: '2026-07-23T09:55:00Z', // discovery / pre-merge
  merge: '2026-07-23T10:00:00Z',
  after: '2026-07-23T10:05:00Z', // post-merge sync
};

// A synced checklist body (has a checked box) vs. one with nothing checked.
const SYNCED = 'Phases:\n- [x] Phase 0\n- [ ] Phase 1\n';
const UNCHECKED = 'Phases:\n- [ ] Phase 0\n- [ ] Phase 1\n';

function runRule(entries) {
  const root = makeRepo({ base: {} });
  try {
    if (!entries) return dispatch(planTrackingFreshness, buildContext({ root }));
    const { path, cleanup: rmTranscript } = makeTranscript(entries);
    try { return dispatch(planTrackingFreshness, buildContext({ root, transcriptPath: path })); }
    finally { rmTranscript(); }
  } finally { cleanup(root); }
}

test('fires: merged, tracker consulted, but no post-merge checklist flip', () => {
  const findings = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    merge(42, T.merge),
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /#100/);
  assert.match(findings[0].what, /PR #42/);
});

test('passes: a box is flipped on the tracker after the merge', () => {
  const findings = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    merge(42, T.merge),
    issueUpdate(100, SYNCED, T.after),
  ]);
  assert.equal(findings.length, 0);
});

test('self-skips: no merge this session', () => {
  const findings = runRule([listTrackers('L1', T.before), listResult('L1', [100], T.before)]);
  assert.equal(findings.length, 0);
});

test('self-skips: no transcript (CI / manual surface)', () => {
  assert.equal(runRule(null).length, 0);
});

test('self-skips: merged but no plan-tracking issue was consulted (offline blind spot)', () => {
  const findings = runRule([merge(42, T.merge), issueUpdate(7, SYNCED, T.after)]);
  assert.equal(findings.length, 0);
});

test('after-not-before: a box flipped BEFORE the merge does not satisfy', () => {
  const findings = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    issueUpdate(100, SYNCED, T.before), // flipped, but before the merge
    merge(42, T.merge),
  ]);
  assert.equal(findings.length, 1);
});

test('a bare comment or an unchecked-body update is not a flip', () => {
  const commented = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    merge(42, T.merge),
    issueComment(100, 'Phase 1 done', T.after),
  ]);
  assert.equal(commented.length, 1);
  const nothingChecked = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    merge(42, T.merge),
    issueUpdate(100, UNCHECKED, T.after),
  ]);
  assert.equal(nothingChecked.length, 1);
});

test('discovery via the update\'s own labels (labeled issue_write) satisfies', () => {
  const findings = runRule([
    merge(42, T.merge),
    issueUpdate(100, SYNCED, T.after, ['plan-tracking']),
  ]);
  assert.equal(findings.length, 0);
});

test('an update on a different issue does not satisfy the tracker', () => {
  const findings = runRule([
    listTrackers('L1', T.before), listResult('L1', [100], T.before),
    merge(42, T.merge),
    issueUpdate(999, SYNCED, T.after), // synced the wrong issue
  ]);
  assert.equal(findings.length, 1);
});
