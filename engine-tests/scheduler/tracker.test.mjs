// The standing-tracker helpers a task's own code-work calls. What these pin is the
// two ways the private copies they replace went wrong — a text-ranked search
// landing on a sibling task's tracker, and a failed search reading as "none
// exists" — plus the re-entrancy every code-work helper owes, since a reclaimed
// claim runs code-work again over its own half-done work.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickTracker, findTracker, createTracker, findOrCreateTracker, writeTracker,
} from '../../engine/scheduler/tracker.mjs';

// A GitHub stand-in whose search is TEXT-ranked like the real one: it returns
// every title containing the query, in insertion order, so a test that passes here
// cannot be relying on the right answer coming back first.
function fakeGh(issues = [], { searchStatus = 200 } = {}) {
  const state = { issues: [...issues], seq: Math.max(0, ...issues.map((i) => i.number)), calls: [] };
  const gh = async (path, { method = 'GET', body } = {}) => {
    state.calls.push(`${method} ${path.split('?')[0]}`);
    if (path.startsWith('/search/issues')) {
      if (searchStatus !== 200) return { status: searchStatus, json: null };
      const term = /in:title "([^"]+)"/.exec(decodeURIComponent(path))?.[1] ?? '';
      return { status: 200, json: { items: state.issues.filter((i) => i.title.includes(term)) } };
    }
    let m;
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path))) {
      const issue = state.issues.find((i) => i.number === Number(m[1]));
      if (!issue) return { status: 404, json: null };
      if (method === 'PATCH') Object.assign(issue, body);
      return { status: 200, json: issue };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(path))) {
      const issue = state.issues.find((i) => i.number === Number(m[1]));
      issue.comments = [...(issue.comments ?? []), body.body];
      return { status: 201, json: {} };
    }
    if (path.endsWith('/issues') && method === 'POST') {
      const issue = { number: (state.seq += 1), title: body.title, body: body.body, state: 'open', comments: [] };
      state.issues.push(issue);
      return { status: 201, json: issue };
    }
    return { status: 404, json: null };
  };
  return { gh, state };
}

test('an exact title wins over a sibling the text search also returns', () => {
  const items = [
    { number: 5, title: 'Claudinite tracker: Tidy Issues', state: 'closed' },
    { number: 6, title: 'Claudinite tracker: Tidy PRs', state: 'closed' },
  ];
  assert.equal(pickTracker(items, 'Claudinite tracker: Tidy PRs').number, 6);
  // The failure this replaces: a task takes the first hit and rewrites another
  // dimension's tracker, with nothing anywhere going red.
  assert.equal(pickTracker(items, 'Claudinite tracker: Tidy Branches'), null);
});

test('the lowest number wins when a past race left two of the same title', () => {
  const items = [
    { number: 40, title: 'Claudinite tracker: Growth Dedup', state: 'closed' },
    { number: 12, title: 'Claudinite tracker: Growth Dedup', state: 'closed' },
  ];
  assert.equal(pickTracker(items, 'Claudinite tracker: Growth Dedup').number, 12);
});

test('a tracker is found in ANY state', async () => {
  // Closed is the resting state of every tracker, so the `is:open` filter one of
  // the private copies carried would miss all of them and open a second one.
  const { gh } = fakeGh([{ number: 9, title: 'Claudinite tracker: Tidy PRs', state: 'closed' }]);
  assert.deepEqual(await findTracker(gh, 'o/r', 'Claudinite tracker: Tidy PRs'), { number: 9, duplicates: 0 });
});

test('findTracker CREATES nothing — a task decides whether a run deserves a tracker', async () => {
  // tidy-repo's three tasks must leave no tracker behind on a run with nothing to
  // record, so looking must never be what mints one.
  const { gh, state } = fakeGh();
  assert.equal(await findTracker(gh, 'o/r', 'Claudinite tracker: Tidy PRs'), null);
  assert.deepEqual(state.issues, []);
});

test('createTracker opens and then closes — two calls, because create ignores state', async () => {
  const { gh, state } = fakeGh();
  const made = await createTracker(gh, 'o/r', 'Claudinite tracker: Tidy PRs');
  const issue = state.issues.find((i) => i.number === made.number);
  assert.equal(issue.state, 'closed');
  // The seed body says what the issue is, because whoever finds it next finds it
  // closed and empty.
  assert.match(issue.body, /Standing tracker/);
});

test('find-or-create twice creates exactly one tracker', async () => {
  // Re-entrancy, not idempotence by luck: a reclaimed claim re-runs code-work, and a
  // second tracker is a silent fork of the log.
  const { gh, state } = fakeGh();
  const first = await findOrCreateTracker(gh, 'o/r', 'Claudinite tracker: Growth Dedup');
  const second = await findOrCreateTracker(gh, 'o/r', 'Claudinite tracker: Growth Dedup');
  assert.equal(first.created, true);
  assert.deepEqual({ number: second.number, created: second.created }, { number: first.number, created: false });
  assert.equal(state.issues.length, 1);
});

test('a failed search THROWS rather than reading as "no tracker exists"', async () => {
  // The one that would be expensive to learn in production: a rate-limited search
  // treated as empty mints a new tracker on every run it fails.
  const { gh, state } = fakeGh([{ number: 9, title: 'Claudinite tracker: Tidy PRs', state: 'closed' }], { searchStatus: 403 });
  await assert.rejects(() => findTracker(gh, 'o/r', 'Claudinite tracker: Tidy PRs'), /search returned 403/);
  await assert.rejects(() => findOrCreateTracker(gh, 'o/r', 'Claudinite tracker: Tidy PRs'), /search returned 403/);
  assert.equal(state.issues.length, 1);
});

test('duplicates from a past race are reported, not silently ignored', async () => {
  const { gh } = fakeGh([
    { number: 12, title: 'Claudinite tracker: Growth Dedup', state: 'closed' },
    { number: 40, title: 'Claudinite tracker: Growth Dedup', state: 'closed' },
  ]);
  assert.deepEqual(await findTracker(gh, 'o/r', 'Claudinite tracker: Growth Dedup'), { number: 12, duplicates: 1 });
});

test('writeTracker replaces the body and appends at most one comment', async () => {
  const { gh, state } = fakeGh([{ number: 9, title: 'T', body: 'yesterday', state: 'closed', comments: [] }]);
  await writeTracker(gh, 'o/r', 9, { body: 'today' });
  await writeTracker(gh, 'o/r', 9, { body: 'today', comment: '2026-08-17 — ran' });
  const issue = state.issues[0];
  assert.equal(issue.body, 'today');
  assert.deepEqual(issue.comments, ['2026-08-17 — ran']);
  // The state is never touched, in either direction, by any write here.
  assert.equal(issue.state, 'closed');
});

test('a write that fails is reported, never swallowed', async () => {
  const { gh } = fakeGh();
  await assert.rejects(() => writeTracker(gh, 'o/r', 404, { body: 'x' }), /could not refresh tracker #404/);
});
