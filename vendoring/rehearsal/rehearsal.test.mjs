import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, MODES } from './fixtures.mjs';
import { rehearse, formatResult } from './rehearse.mjs';
import { SETTINGS_FILES, LEGACY_SETTINGS_FILE } from '../../engine/settings-file.mjs';

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

// A fixture is a MEMBER, which since #1252 is a repo carrying either settings-file
// name — and one fixture deliberately carries the retired one, because that is the
// shape every member is in until its own converge runs the rename record.
test('every fixture is a member under exactly one settings-file name, and one models the retired name', () => {
  const carriesLegacyName = [];
  for (const f of FIXTURES) {
    const names = Object.keys(f.files).filter((n) => SETTINGS_FILES.includes(n));
    assert.equal(names.length, 1, `${f.name} is not a member (or carries both settings-file names)`);
    if (names[0] === LEGACY_SETTINGS_FILE) carriesLegacyName.push(f.name);
  }
  assert.deepEqual(carriesLegacyName, ['legacy-settings-name'],
    'exactly one fixture must model the pre-rename shape — with none, the two-name tolerance every member depends on is untested');
});
