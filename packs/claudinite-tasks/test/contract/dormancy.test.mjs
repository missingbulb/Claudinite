import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDormant, dormancyErrors, TASKS_PACK_ID } from '../../src/contract/dormancy.mjs';
import { isDormant as published } from '../../shared-code/dormancy.mjs';
import { loadConfig } from '../../../../engine/checks/helpers/repo-context.mjs';

// A member's declaration exactly as it sits on disk — the shape a cross-repo reader
// fetches over the API, with no engine loaded against that tree.
const declaring = (entry, rest = {}) => ({ packs: [entry], ...rest });

const inRepo = (declaration) => {
  const root = mkdtempSync(join(tmpdir(), 'dormancy-'));
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify(declaration, null, 2));
  return root;
};

test('the setting is read off the tasks pack entry', () => {
  assert.equal(isDormant(declaring({ id: TASKS_PACK_ID, config: { dormant: true } })), true);
  assert.equal(isDormant(declaring({ id: TASKS_PACK_ID, config: { dormant: false } })), false);
  assert.equal(isDormant(declaring({ id: TASKS_PACK_ID, config: {} })), false);
  assert.equal(isDormant(declaring(TASKS_PACK_ID)), false, 'a bare declaration is awake');
});

test('another pack carrying the same word never speaks for the scheduler', () => {
  // The whole point of the move: `dormant` is the scheduler's parameter, so a pack
  // that is not the scheduler's cannot stop it.
  assert.equal(isDormant(declaring({ id: 'basics', config: { dormant: true } })), false);
});

test('a repo with no tasks pack has no scheduler to be dormant', () => {
  assert.equal(isDormant({ packs: ['basics', 'git-github'] }), false);
});

test('the legacy top-level key still reads, underneath the pack entry', () => {
  // A member the migration record has not reached yet. Reading it wrong flips a repo
  // that asked to sleep back awake, which is that repo's whole scheduled workload.
  assert.equal(isDormant({ packs: [TASKS_PACK_ID], dormant: true }), true);
  // …and the pack entry wins where both are present, so a converged member whose
  // stale top-level key was left behind still reads by its current declaration.
  assert.equal(
    isDormant(declaring({ id: TASKS_PACK_ID, config: { dormant: false } }, { dormant: true })),
    false,
  );
});

test('one predicate answers for a raw declaration and for the loaded config alike', () => {
  // A cross-repo reader has the raw file; the scheduler has what loadConfig returned.
  // A second notion of dormancy would nag exactly the repos that had already opted out.
  const declaration = declaring({ id: TASKS_PACK_ID, config: { dormant: true } });
  assert.equal(isDormant(declaration), true);
  assert.equal(isDormant(loadConfig(inRepo(declaration))), true, 'the normalized view agrees');

  const awake = declaring({ id: TASKS_PACK_ID, config: { dormant: false } });
  assert.equal(isDormant(loadConfig(inRepo(awake))), false);
});

test('the legacy key survives the trip through loadConfig', () => {
  // loadConfig no longer normalizes a `dormant` field, so this passes only if the
  // predicate reads the raw key off the loaded shape rather than a field it minted.
  assert.equal(isDormant(loadConfig(inRepo({ packs: [TASKS_PACK_ID], dormant: true }))), true);
});

test('a non-boolean is a settings error, never coerced', () => {
  // A string "true", a { since } object or a reason left in its place all read as
  // dormant to a truthiness test and awake to an `=== true` one, and the difference
  // is a whole repo's scheduled work.
  for (const bad of ['true', 1, { since: '2026-01-01' }, 'parked while we rewrite it']) {
    const declaration = declaring({ id: TASKS_PACK_ID, config: { dormant: bad } });
    assert.equal(isDormant(declaration), false, `${JSON.stringify(bad)} is not dormancy`);
    const errors = dormancyErrors(declaration);
    assert.equal(errors.length, 1, `${JSON.stringify(bad)} is reported`);
    assert.match(errors[0].what, /dormant/);
    assert.ok(errors[0].fix, 'a settings error carries its remedy');
  }
});

test('a well-formed or absent declaration reports nothing', () => {
  assert.deepEqual(dormancyErrors(declaring({ id: TASKS_PACK_ID, config: { dormant: true } })), []);
  assert.deepEqual(dormancyErrors(declaring({ id: TASKS_PACK_ID, config: { dormant: false } })), []);
  assert.deepEqual(dormancyErrors(declaring(TASKS_PACK_ID)), []);
  assert.deepEqual(dormancyErrors({}), []);
});

test('the legacy top-level key is type-checked on the same terms', () => {
  assert.equal(dormancyErrors({ packs: [TASKS_PACK_ID], dormant: 'true' }).length, 1);
});

test('a misshapen declaration is answered, never thrown on', () => {
  // The world runner reports malformed settings as the settings error they are; a
  // predicate that threw would take the whole sweep down with it.
  for (const junk of [null, undefined, 42, 'nope', [], { packs: 'not-an-array' }, { packs: [null, 7] }]) {
    assert.equal(isDormant(junk), false, `${JSON.stringify(junk)} is not dormancy`);
    assert.deepEqual(dormancyErrors(junk), []);
  }
});

test('the published surface is the same function, never a second implementation', () => {
  // Shepherd and the dashboard import through shared-code/; the scheduler imports the
  // module directly. Two implementations would be two notions of dormancy — the exact
  // failure this predicate exists to prevent.
  assert.equal(published, isDormant);
});
