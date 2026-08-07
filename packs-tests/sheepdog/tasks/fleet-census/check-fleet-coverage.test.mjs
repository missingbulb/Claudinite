import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCensusSummary } from '../../../../packs/sheepdog/tasks/fleet-census/check-fleet-coverage.mjs';

// The census's report is a FULL-fleet roster: every repo the census enumerated is
// named under exactly one state, plus the enforcer itself. The renderer is pure so
// that property is testable directly — a state whose members are only counted is
// exactly the hole this guards against.

const buckets = {
  owner: 'o',
  home: 'o/sheepdog',
  covered: ['o/alpha', 'o/beta'],
  dormant: ['o/asleep'],
  uncovered: ['o/naked'],
  optedOut: ['o/left-out'],
  skipped: ['o/attic (archived)', 'o/copy (fork)'],
  unknown: ['o/flaky — declaration returned 500'],
  actions: ['opened #9 (o/naked)'],
};

test('census summary: every repo appears by name, whatever its state', () => {
  const out = renderCensusSummary(buckets);
  for (const repo of ['o/alpha', 'o/beta', 'o/asleep', 'o/naked', 'o/left-out', 'o/attic', 'o/copy', 'o/flaky']) {
    assert.ok(out.includes(repo), `${repo} must be named in the summary`);
  }
  // The enforcer is not censused, but it is still accounted for — named, with why.
  assert.match(out, /\*\*Not censused:\*\* o\/sheepdog/);
});

test('census summary: each state is labelled, so a name is never ambiguous', () => {
  const out = renderCensusSummary(buckets);
  assert.match(out, /\*\*Covered:\*\* o\/alpha, o\/beta/);
  assert.match(out, /dormant.*o\/asleep/i);
  assert.match(out, /\*\*Uncovered \(adoption issue open\):\*\* o\/naked/);
  assert.match(out, /\*\*Opted out \(config\.exclude\):\*\* o\/left-out/);
  assert.match(out, /\*\*UNKNOWN.*o\/flaky/);
});

test('census summary: an empty state says none rather than vanishing', () => {
  // "Covered: none" and a missing Covered line read very differently — the first is
  // a fact about the fleet, the second is a hole in the report.
  const out = renderCensusSummary({ ...buckets, covered: [], uncovered: [], actions: [] });
  assert.match(out, /\*\*Covered:\*\* none/);
  assert.match(out, /\*\*Uncovered:\*\* none 🎉/);
  assert.match(out, /\*\*Issue actions:\*\* none \(converged\)/);
});
