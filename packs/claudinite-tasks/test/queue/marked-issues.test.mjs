// Reading the requests: which open issues the scheduler run sees as awaiting
// adoption. The PLAN half of adoption is covered in scheduler-run.test.mjs, which
// hands `requests` in directly — so nothing there can tell whether the list this
// builds is the one GitHub would actually return, which is how the whole request
// lane went silent for three days with every run reporting success (#1354).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listMarkedIssues } from '../../queue/scheduler-run.mjs';
import { ORIGIN_AD_HOC, REQUEST_LABEL, STATUS_READY } from '../../queue/work-item.mjs';

// GitHub's issues-list `labels` filter is CONJUNCTIVE: a comma-separated list
// selects the issues carrying EVERY name on it, not any of them. That is modelled
// here rather than assumed away — a fake that ORs would agree with a broken reader
// and prove nothing, which is the whole failure this file exists to catch.
function fakeGh(issues, { failOn = null } = {}) {
  const calls = [];
  const gh = async (path) => {
    const wanted = decodeURIComponent(/[?&]labels=([^&]*)/.exec(path)?.[1] ?? '').split(',').filter(Boolean);
    calls.push(wanted.join(','));
    if (failOn && wanted.includes(failOn)) return { status: 502, json: null };
    if (Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1) > 1) return { status: 200, json: [] };
    const names = (i) => (i.labels ?? []).map((l) => l.name);
    return { status: 200, json: issues.filter((i) => wanted.every((w) => names(i).includes(w))) };
  };
  return { gh, calls };
}

const issue = (number, labels, extra = {}) => ({
  number, title: `request ${number}`, body: '', state: 'open',
  labels: labels.map((name) => ({ name })), user: { login: 'owner' }, ...extra,
});

const hasPush = async () => true;

test('an issue wearing only the current mark is a request awaiting adoption', async () => {
  const { gh } = fakeGh([issue(10, [ORIGIN_AD_HOC])]);
  const out = await listMarkedIssues(gh, 'o/r', { permissionOf: hasPush });
  assert.deepEqual(out.map((r) => r.number), [10],
    'the current mark alone must be enough — nothing wears both spellings, so a filter demanding both selects nothing');
});

test('the retired spelling is still read, and an issue wearing both is returned once', async () => {
  const { gh } = fakeGh([issue(11, [REQUEST_LABEL]), issue(12, [ORIGIN_AD_HOC, REQUEST_LABEL])]);
  const out = await listMarkedIssues(gh, 'o/r', { permissionOf: hasPush });
  assert.deepEqual(out.map((r) => r.number).sort((a, b) => a - b), [11, 12]);
});

test('each mark is asked for on its own, never as one comma-joined filter', async () => {
  const { gh, calls } = fakeGh([issue(13, [ORIGIN_AD_HOC])]);
  await listMarkedIssues(gh, 'o/r', { permissionOf: hasPush });
  assert.ok(!calls.some((c) => c.includes(',')),
    `a comma-joined label filter is an AND across the marks — asked for ${JSON.stringify(calls)}`);
});

test('an already-adopted mark is not a request, and neither is a filed work item', async () => {
  const { gh } = fakeGh([
    issue(14, [ORIGIN_AD_HOC, STATUS_READY]),
    issue(15, [ORIGIN_AD_HOC], { title: '[claudinite-work] some/task' }),
    issue(16, [ORIGIN_AD_HOC]),
  ]);
  const out = await listMarkedIssues(gh, 'o/r', { permissionOf: hasPush });
  assert.deepEqual(out.map((r) => r.number), [16]);
});

// A list that could not be READ is not a list that is EMPTY. Swallowing the
// difference is what let this run clean while it adopted nothing: every scheduler
// run reported success, and the only evidence was 25 issues nobody had touched.
test('a request list that cannot be read fails the run rather than reading as empty', async () => {
  const { gh } = fakeGh([issue(17, [ORIGIN_AD_HOC])], { failOn: ORIGIN_AD_HOC });
  await assert.rejects(() => listMarkedIssues(gh, 'o/r', { permissionOf: hasPush }), /502/);
});

// The sibling listing, same swallow, worse consequence: a page the API refused used
// to end the loop, so the run planned against a truncated queue — and a standing
// item whose page never arrived reads as absent, which mints a second one beside it.
test('a work-item page that cannot be read fails the run rather than ending the list', async () => {
  const { listWorkItems } = await import('../../queue/scheduler-run.mjs');
  const gh = async () => ({ status: 403, json: null });
  await assert.rejects(() => listWorkItems(gh, 'o/r'), /403/);
});

// THE OTHER HALF OF THE ONE-ISSUE MODEL (#1497). An adopted marked issue is an item
// that never gains the title prefix, and the scheduler run's own list was the only
// reader still testing for it — so job 2, the ONLY site that releases a blocked
// item, never saw one. Four ad-hoc items slept days past their `Not-before:`.
test('an ADOPTED marked issue is in the work-item list, and an unadopted mark is not', async () => {
  const { listWorkItems } = await import('../../queue/scheduler-run.mjs');
  const { gh } = fakeGh([
    issue(20, [ORIGIN_AD_HOC, STATUS_READY], { title: 'Verify in production: something' }),
    issue(21, [ORIGIN_AD_HOC], { title: 'please do this' }),
    issue(22, [], { title: '[claudinite-work] p/digest' }),
  ]);
  const out = await listWorkItems(gh, 'o/r');
  assert.deepEqual(out.map((i) => i.number).sort((a, b) => a - b), [20, 22],
    'an adopted mark is an item; a mark with no status is a request the adoption list owns');
});

// The blockers a run must still read. This is the step that broke the FIRST run
// after adoption started working: `main` named `parseBlockedBy` and never imported
// it, so the line threw the moment a marked issue reached it — dead code for three
// days behind an adoption list that was always empty, and the whole suite green
// throughout. Nothing drives `main`, so the step is exercised here instead.
test('a marked issue\'s own blockers are read, alongside a blocked item\'s', async () => {
  const { blockersToResolve } = await import('../../queue/scheduler-run.mjs');
  const { STATUS_BLOCKED, workItemBody } = await import('../../queue/work-item.mjs');

  const items = [{
    number: 200, state: 'open', labels: [{ name: STATUS_BLOCKED }],
    body: workItemBody({ taskPath: 't/task.mjs', blockedBy: [900] }),
  }];
  const requests = [{ number: 201, body: 'Blocked-by: #901\n' }];

  // 900 is already answered by the fetched items; 902 is not named at all.
  const wanted = blockersToResolve(items, requests, new Map([[902, 'open']]));
  assert.deepEqual([...wanted].sort((a, b) => a - b), [900, 901]);
});

test('a blocker already answered is not re-read', async () => {
  const { blockersToResolve } = await import('../../queue/scheduler-run.mjs');
  const wanted = blockersToResolve([], [{ number: 202, body: 'Blocked-by: #903\n' }], new Map([[903, 'closed']]));
  assert.deepEqual([...wanted], []);
});
