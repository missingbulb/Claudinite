import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, MODES } from './fixtures.mjs';
import { rehearse, formatResult } from './rehearse.mjs';
import { SETTINGS_FILE } from '../../engine/settings-file.mjs';

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

// The stale mode is only meaningful if the versions it writes actually reach the
// tree — otherwise every "with a migration" run is silently a "without" run, and
// the half of the gate that covers migrations would pass by doing nothing.
test('the stale mode really pins the fixture below the corpus before converging', () => {
  const fixture = FIXTURES.find((f) => f.name === 'canon-packs');
  const stale = MODES.find((m) => m.name === 'stale');
  const r = rehearse(fixture, stale);
  assert.ok(r.ok, `\n${formatResult(r)}\n`);
  // apply-vendor-set advances the versions, so the POST-converge numbers are
  // current; what must be true is that the converge ran against the pinned ones.
  assert.ok(r.stamp?.engineVersion, 'the converge recorded no engine version at all');
  assert.notEqual(r.stamp.engineVersion, stale.installed.engineVersion,
    'the engine version was never advanced — apply-vendor-set did not run');
});

// A fixture is a MEMBER, which is a repo carrying the settings file. The retired
// name it was also read under until #1640 is read by nothing now, so a fixture
// carrying it would model a repo the engine cannot see rather than a member.
test('every fixture is a member — it carries the settings file', () => {
  for (const f of FIXTURES) {
    assert.ok(Object.hasOwn(f.files, SETTINGS_FILE), `${f.name} carries no ${SETTINGS_FILE} — it is not a member`);
  }
});
