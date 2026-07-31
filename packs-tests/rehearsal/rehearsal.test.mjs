import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, MODES } from './fixtures.mjs';
import { rehearse, formatResult } from './rehearse.mjs';

// THE GATE (#593 phase 2). Every fixture consumer, in both modes, converged with
// the REAL scripts against this working tree. A canon change that would break a
// member fails here — before it merges, which is the whole point.
//
// This is the test that #555 needed and did not have: canon CI was green while
// eleven consumer packs stopped validating, because the canon's own packs were
// already migrated and nothing ever converged anything else.
//
// Slower than a unit test (four fixtures x two modes, each vendoring the whole
// set and running two sweeps) and that is the correct trade — it runs on every
// canon PR, and the alternative is finding out from the fleet.

for (const fixture of FIXTURES) {
  for (const mode of MODES) {
    test(`rehearsal: ${fixture.name} [${mode.name}] — ${fixture.why}`, () => {
      const r = rehearse(fixture, mode);
      assert.ok(r.ok, `\n${formatResult(r)}\n`);
    });
  }
}

// The stale mode is only meaningful if the stamp it writes actually reaches the
// tree — otherwise every "with a migration" run is silently a "without" run, and
// the half of the gate that covers migrations would pass by doing nothing.
test('the stale mode really pins the fixture in the past before converging', () => {
  const fixture = FIXTURES.find((f) => f.name === 'canon-packs');
  const stale = MODES.find((m) => m.name === 'stale');
  const r = rehearse(fixture, stale);
  assert.ok(r.ok, `\n${formatResult(r)}\n`);
  // apply-vendor-set advances the stamp, so the POST-converge stamp is fresh;
  // what must be true is that the converge ran against the pinned one.
  assert.ok(r.stamp?.updated, 'the converge left no stamp at all');
  assert.notEqual(r.stamp.updated, stale.updated, 'the stamp was never advanced — apply-vendor-set did not run');
});

test('every fixture declares why it exists — a shape nobody can explain is not a shape', () => {
  for (const f of FIXTURES) {
    assert.ok(f.why && f.why.length > 20, `${f.name} carries no why`);
    assert.ok(Object.keys(f.files).includes('.claudinite-checks.json'), `${f.name} is not a member`);
  }
  assert.deepEqual(MODES.map((m) => m.name), ['fresh', 'stale']);
});
