// That a fleet sweep is HORIZONTAL, which is the whole point of `fleet-sweep.mjs`.
// The ordering is not a preference: the viewer's rate limit can run out mid-sweep, so
// a depth-first sweep spends it on the first members' decoration and leaves the last
// members unread — the one failure this module exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sweepPhases } from '../fleet-sweep.mjs';

const tick = () => new Promise((r) => setTimeout(r, 0));

// A phase that records `<phase>:<repo>` when it finishes, after yielding — so a
// depth-first implementation has every opportunity to interleave and be caught.
const recorder = (log, id, opts = {}) => ({
  id,
  label: id,
  ...opts,
  run: async (m) => {
    await tick();
    log.push(`${id}:${m.repo}`);
  },
});

const members = (...repos) => repos.map((repo, i) => ({ repo, i }));

test('every member finishes a pass before any member starts the next', async () => {
  const log = [];
  const roster = members('o/a', 'o/b', 'o/c', 'o/d', 'o/e', 'o/f');
  await sweepPhases({
    members: roster,
    phases: [recorder(log, 'identity'), recorder(log, 'attention'), recorder(log, 'depth')],
    limit: 2,
  });

  assert.equal(log.length, roster.length * 3);
  const phases = log.map((e) => e.split(':')[0]);
  assert.deepEqual(
    phases,
    [...Array(6).fill('identity'), ...Array(6).fill('attention'), ...Array(6).fill('depth')],
    'a pass may not begin while another member is still in the pass before it',
  );
});

test('a pass reads only the members it applies to, and says so when that is none', async () => {
  const log = [];
  const seen = [];
  const roster = members('o/adopted', 'o/plain');
  await sweepPhases({
    members: roster,
    phases: [
      recorder(log, 'identity'),
      recorder(log, 'attention', { appliesTo: (m) => m.repo.endsWith('adopted') }),
      recorder(log, 'graphs', { appliesTo: () => false }),
    ],
    onAdvance: (a) => seen.push({ phase: a.phase, done: a.done, total: a.total, repo: a.member?.repo ?? null }),
  });

  assert.deepEqual(log.filter((e) => e.startsWith('attention:')), ['attention:o/adopted']);
  // A pass with nobody in it still announces itself: "no member had one" and "the
  // pass has not started" must not look identical on the progress line.
  assert.deepEqual(seen.at(-1), { phase: 'graphs', done: 0, total: 0, repo: null });
  // The counts are the PASS's own population, never the roster's, so a progress line
  // built from them cannot claim members it was never going to read.
  assert.deepEqual(
    seen.filter((s) => s.phase === 'attention').map((s) => `${s.done}/${s.total}`),
    ['1/1'],
  );
});

test('one member throwing does not take the pass, or the passes after it, down', async () => {
  const log = [];
  const errors = [];
  const roster = members('o/good', 'o/bad');
  await sweepPhases({
    members: roster,
    phases: [
      { id: 'depth', label: 'depth', run: async (m) => { if (m.repo === 'o/bad') throw new Error('403'); log.push(`depth:${m.repo}`); } },
      recorder(log, 'graphs'),
    ],
    onAdvance: (a) => { if (a.error) errors.push([a.phase, a.member.repo, a.error.message]); },
  });

  assert.deepEqual(errors, [['depth', 'o/bad', '403']]);
  assert.deepEqual(log.filter((e) => e.startsWith('graphs:')).sort(), ['graphs:o/bad', 'graphs:o/good'],
    'the pass after the failure still reads the member whose earlier pass threw');
  assert.deepEqual(log.filter((e) => e.startsWith('depth:')), ['depth:o/good'], 'and the rest of that pass still ran');
});

test('a pass runs no more than `limit` members at once', async () => {
  let live = 0;
  let peak = 0;
  await sweepPhases({
    members: members('o/a', 'o/b', 'o/c', 'o/d', 'o/e'),
    phases: [{
      id: 'identity',
      label: 'identity',
      run: async () => { live += 1; peak = Math.max(peak, live); await tick(); live -= 1; },
    }],
    limit: 2,
  });
  assert.equal(peak, 2, 'a burst wide enough to trip secondary rate limiting is the thing being avoided');
});
