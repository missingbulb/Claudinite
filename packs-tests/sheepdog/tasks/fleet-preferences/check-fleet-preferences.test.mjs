import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyPreferences, engineKnowsPreferences, withPreferences, SET,
} from '../../../../packs/sheepdog/tasks/fleet-preferences/check-fleet-preferences.mjs';

// The preferences sweep's whole judgement is `classifyPreferences` plus the engine gate
// and the one edit — all pure, so every branch is exercised here without a network.
// This is the one sweep in the pack that WRITES to a member, and each test below pins
// one of the reasons it is safe to.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

// --- the engine gate ----------------------------------------------------------

test('engineKnowsPreferences: THIS repo\'s engine passes the gate', () => {
  // The drift guard that matters most. The gate reads the setting vocabulary out of a
  // member's own engine source; if CONFIG_KEYS is ever renamed or reformatted past the
  // pattern, the gate silently answers "no" for every member forever and the sweep
  // quietly stops writing — a failure with no error anywhere. Reading the real file
  // makes that rename fail here instead.
  const engine = readFileSync(join(repoRoot, 'engine/checks/helpers/repo-context.mjs'), 'utf8');
  assert.equal(engineKnowsPreferences(engine), true);
});

test('engineKnowsPreferences: an engine that predates the setting is a NO, and so is nothing at all', () => {
  // The real shape of the vocabulary before this change: legal, complete, and it would
  // reject `preferences` as an unknown setting — a blocking config error in that repo.
  const before = "export const CONFIG_KEYS = ['packs', 'rules', 'accept', 'sharedConstants', 'packConfig', 'maintenance', 'claudinite', 'taskScheduler', 'badges', 'dormant'];";
  assert.equal(engineKnowsPreferences(before), false);
  // A near-miss must not pass: the word appearing elsewhere in the file is not the key
  // being in the list.
  assert.equal(engineKnowsPreferences(`${before}\n// preferences are per-user\n`), false);
  for (const nothing of ['', null, undefined, 'export const OTHER = [1];']) {
    assert.equal(engineKnowsPreferences(nothing), false, String(nothing));
  }
  assert.equal(engineKnowsPreferences('const CONFIG_KEYS = ["dormant", "preferences"]'), true);
});

// --- classification -----------------------------------------------------------

const classify = (over) => classifyPreferences({ config: { packs: [] }, wanted: 'o/fleet', engineKnows: true, ...over });

test('classifyPreferences: a member already pointing home is read and left alone', () => {
  const v = classify({ config: { preferences: { repo: 'o/fleet' } } });
  assert.equal(v.state, SET);
  // Case is not identity for a GitHub repo path, so a differently-cased pointer is the
  // same pointer — rewriting it would be a commit a day, forever.
  assert.equal(classify({ config: { preferences: { repo: 'O/Fleet' } } }).state, SET);
  assert.match(v.detail, /already points at/);
  // A path the member chose is the member's business: the fleet is the authority on
  // WHICH REPO, not on where inside it.
  assert.equal(classify({ config: { preferences: { repo: 'o/fleet', path: 'people' } } }).state, SET);
});

test('classifyPreferences: a member with no pointer is writable, and says which case it was', () => {
  const missing = classify({});
  assert.equal(missing.state, 'writable');
  assert.equal(missing.malformed, false);
  assert.match(missing.detail, /declares no preferences home/);

  // A key that does not RESOLVE is a repair, not an addition — and the summary says so,
  // because replacing a value someone wrote is a different act from adding one.
  const broken = classify({ config: { preferences: 'o/fleet' } });
  assert.equal(broken.state, 'writable');
  assert.equal(broken.malformed, true);
  assert.match(broken.detail, /does not resolve/);
});

test('classifyPreferences: a pointer at a DIFFERENT repo is reported, never overwritten', () => {
  const v = classify({ config: { preferences: { repo: 'o/somewhere-else' } } });
  assert.equal(v.state, 'elsewhere');
  assert.match(v.detail, /left alone/);
});

test('classifyPreferences: the engine gate outranks the write — a member is never given a key it would reject', () => {
  // An unknown top-level setting is a BLOCKING config error, and a member runs whatever
  // engine its vendored mount carries. So this is a WAIT, not a finding: members
  // re-vendor nightly and get written the first run after their own mount learned the
  // key, which is what makes the rollout need no coordination.
  const v = classify({ engineKnows: false });
  assert.equal(v.state, 'engine-behind');
  assert.match(v.detail, /blocking config error|does not accept/);
  // …and it applies to the malformed case too — repairing a key the engine rejects
  // would trade one config error for another.
  assert.equal(classify({ engineKnows: false, config: { preferences: 42 } }).state, 'engine-behind');
  // But a member already pointing home is never gated: nothing is being written.
  assert.equal(classify({ engineKnows: false, config: { preferences: { repo: 'o/fleet' } } }).state, SET);
});

// --- the edit -----------------------------------------------------------------

test('withPreferences: adds the key, keeps everything else, and writes canonical settings', () => {
  const before = `${JSON.stringify({ packs: ['basics'], maintenance: { delivery: 'auto-merge' } }, null, 2)}\n`;
  const after = withPreferences(before, 'o/fleet');
  const parsed = JSON.parse(after);
  assert.deepEqual(parsed.packs, ['basics']);
  assert.deepEqual(parsed.maintenance, { delivery: 'auto-merge' });
  assert.deepEqual(parsed.preferences, { repo: 'o/fleet' });
  // 2-space with a trailing newline — the shape `--init` writes, because the file is
  // round-tripped through JSON rather than edited as text.
  assert.equal(after, `${JSON.stringify(parsed, null, 2)}\n`);
  assert.ok(after.endsWith('}\n'));
  // Idempotent: running it again changes nothing at all.
  assert.equal(withPreferences(after, 'o/fleet'), after);
});

test('withPreferences: replaces an unresolvable pointer in place, and refuses a non-object declaration', () => {
  const after = withPreferences(`${JSON.stringify({ packs: [], preferences: 'o/typo' }, null, 2)}\n`, 'o/fleet');
  assert.deepEqual(JSON.parse(after).preferences, { repo: 'o/fleet' });
  // Only the pointer is written — the path stays the engine's default, so no member
  // carries a knob nobody chose.
  assert.deepEqual(Object.keys(JSON.parse(after).preferences), ['repo']);
  for (const bad of ['[]', 'null', '"text"']) {
    assert.throws(() => withPreferences(bad, 'o/fleet'), /not a JSON object/, bad);
  }
  assert.throws(() => withPreferences('{oops', 'o/fleet'));
});
