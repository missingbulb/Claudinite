import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terms, RELEASE_TASK_ID } from '../../../tasks/site-release/preconditions.mjs';

const gate = terms['unreleased-commits'];
const commits = (...list) => ({ commits: { list, count: list.length } });
// Newest first, the order the collector preserves.
const work = (sha) => ({ sha, task: null });
const release = (sha) => ({ sha, task: RELEASE_TASK_ID });

test('runs when work landed above the last release', () => {
  const verdict = gate.holds(commits(work('aaa1111'), release('bbb2222'), work('ccc3333')));
  assert.equal(verdict.holds, true);
  assert.match(verdict.reason, /1 commit/);
  assert.match(verdict.context[0], /aaa1111/);
  assert.doesNotMatch(verdict.context[0], /ccc3333/);
});

// The loop the gate exists to stop: the release's own bump commit keeps the window
// non-empty, so a membership test would re-release the same bytes every night.
test('declines when the newest commit is the release itself', () => {
  const verdict = gate.holds(commits(release('bbb2222'), work('ccc3333')));
  assert.equal(verdict.holds, false);
  assert.match(verdict.reason, /the last release itself/);
});

test('a second evaluation after a release still declines', () => {
  const after = commits(release('bbb2222'), work('ccc3333'));
  assert.equal(gate.holds(after).holds, false);
  assert.equal(gate.holds(after).holds, false);
});

// The no-version case: a repo without public-website leaves no release commit, so
// the gate falls back to the window — a change is deployed the night it lands.
test('runs when the window holds work and no release at all', () => {
  assert.equal(gate.holds(commits(work('aaa1111'))).holds, true);
});

test('declines on a branch that did not move', () => {
  const verdict = gate.holds(commits());
  assert.equal(verdict.holds, false);
  assert.match(verdict.reason, /no commit landed/);
});

test('consecutive releases at the top count as nothing to release', () => {
  assert.equal(gate.holds(commits(release('bbb2222'), release('bbb1111'), work('ccc3333'))).holds, false);
});

test('the signal the gate reads is the signal it declares', () => {
  assert.deepEqual(gate.signals, ['commits']);
  assert.equal(gate.holds({}).holds, false);
});

// The worker stamps its release commits with the id the queue hands it —
// `<pack>/<task>`, derived from the two directory names — and the gate recognises a
// release commit by comparing against this literal. A rename of either directory
// silently stops the gate seeing the release's own commits.
test("the gate's task id is the one the directories give the queue", () => {
  assert.equal(RELEASE_TASK_ID, 'github-pages/site-release');
});
