import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDispatch, classifyScope, parseRepoFilter, forceOne, SCHEDULER, FORCE_OVERRIDES,
} from '../../../packs/sheepdog/fleet-baseline/force-fleet-baseline.mjs';

// The sweep's judgement is `classifyDispatch` — pure, so every status the dispatch API
// can answer with is exercised here without a network. The point of the function is that
// each status is a DIFFERENT thing for the reader to do; a test that only asserted
// "success vs failure" would let the four distinct remedies collapse into one.

test('classifyDispatch: 204 is the only success — a queued run, not a finished baseline', () => {
  const v = classifyDispatch(204);
  assert.equal(v.state, 'forced');
  assert.match(v.detail, /queued/);
});

test('classifyDispatch: each failure names its own remedy', () => {
  assert.equal(classifyDispatch(404).state, 'no-scheduler');
  assert.match(classifyDispatch(404).detail, /claudinite-scheduler\.yml/);
  assert.equal(classifyDispatch(403).state, 'no-permission');
  assert.match(classifyDispatch(403).detail, /Actions: write/);
  assert.equal(classifyDispatch(422).state, 'not-dispatchable');
  assert.match(classifyDispatch(422).detail, /disabled/);
});

test('classifyDispatch: an unmapped status is an error carrying the status, never a silent success', () => {
  for (const status of [200, 401, 500, 502]) {
    const v = classifyDispatch(status);
    assert.equal(v.state, 'error', `status ${status}`);
    assert.match(v.detail, new RegExp(String(status)));
  }
});

test('parseRepoFilter: empty means the whole fleet, not an empty fleet', () => {
  assert.equal(parseRepoFilter('', 'missingbulb'), null);
  assert.equal(parseRepoFilter(undefined, 'missingbulb'), null);
  assert.equal(parseRepoFilter('  ,  ', 'missingbulb'), null);
});

test('parseRepoFilter: bare names are qualified with the owner, and matching is case-insensitive', () => {
  const f = parseRepoFilter('Alpha, missingbulb/Beta\n gamma', 'missingbulb');
  assert.deepEqual([...f].sort(), ['missingbulb/alpha', 'missingbulb/beta', 'missingbulb/gamma']);
});

test('forceOne: dispatches the member own scheduler on its own default branch', async () => {
  const calls = [];
  const gh = async (path, opts) => { calls.push({ path, opts }); return { status: 204, json: null }; };
  const v = await forceOne(gh, 'missingbulb/Alpha', 'trunk');
  assert.equal(v.state, 'forced');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `/repos/missingbulb/Alpha/actions/workflows/${SCHEDULER}/dispatches`);
  assert.equal(calls[0].opts.method, 'POST');
  // The ref is the member's default branch, never an assumed `main`: workflow_dispatch
  // resolves the workflow file on the ref it is given, so a `master` repo would 404 as
  // if it carried no scheduler at all.
  assert.deepEqual(calls[0].opts.body, { ref: 'trunk', inputs: { overrides: FORCE_OVERRIDES } });
});

test('the override string is exactly what the vendored scheduler understands', () => {
  // engine/scheduler/run.mjs reads FORCE_TASKS out of CLAUDINITE_OVERRIDES and splits on
  // commas; the member-side task id is `baselining`. A typo here fires nothing and the
  // dispatch still returns 204, so this is the one coupling worth pinning literally.
  assert.equal(FORCE_OVERRIDES, 'FORCE_TASKS=baselining');
});

// --- scope classification -----------------------------------------------------
// Every repo the dispatch does NOT reach lands in the report's skipped list with a
// reason — classifyScope is that judgement, pure so each branch is testable. A
// silent `continue` here is a repo the fleet-wide report loses.

test('classifyScope: canon, archived, forks, excluded and filtered-out are all named reasons', () => {
  const ctx = { canonRepo: 'o/Claudinite', exclude: new Set(['o/left-out']), filter: null };
  const repo = (over) => ({ full_name: 'o/alpha', archived: false, fork: false, ...over });
  assert.equal(classifyScope(repo({ full_name: 'o/Claudinite' }), ctx).state, 'canon');
  assert.equal(classifyScope(repo({ archived: true }), ctx).state, 'out-of-scope');
  assert.match(classifyScope(repo({ archived: true }), ctx).detail, /archived/);
  assert.equal(classifyScope(repo({ fork: true }), ctx).state, 'out-of-scope');
  assert.match(classifyScope(repo({ fork: true }), ctx).detail, /fork/);
  assert.equal(classifyScope(repo({ full_name: 'o/left-out' }), ctx).state, 'excluded');
  const filtered = { ...ctx, filter: new Set(['o/beta']) };
  assert.equal(classifyScope(repo({}), filtered).state, 'filtered-out');
});

test('classifyScope: an ordinary in-scope member is null — the dispatch proceeds', () => {
  const ctx = { canonRepo: 'o/Claudinite', exclude: new Set(), filter: null };
  assert.equal(classifyScope({ full_name: 'o/alpha', archived: false, fork: false }, ctx), null);
  // …and a filter that names it keeps it in scope.
  assert.equal(classifyScope({ full_name: 'o/alpha', archived: false, fork: false },
    { ...ctx, filter: new Set(['o/alpha']) }), null);
});
