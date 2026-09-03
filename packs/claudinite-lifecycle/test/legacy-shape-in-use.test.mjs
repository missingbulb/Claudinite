import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-shape-in-use.mjs';
import { LEGACY_SETTINGS_FILE, SETTINGS_FILE } from '../../../engine/settings-file-names.mjs';
import { RENAMED_PACKS } from '../../../engine/pack_loader/renamed-packs.mjs';

// A ctx over an in-memory file map — no git, no fixture tree.
const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const run = (declaration, { name = SETTINGS_FILE } = {}) =>
  rule.run(ctx({ [name]: JSON.stringify(declaration) }));
const whats = (findings) => findings.map((f) => f.what).join('\n');

test('legacy-shape-in-use: inert in a repo that is not a member', () => {
  assert.deepEqual(rule.run(ctx({ 'package.json': '{}' })), []);
});

test('legacy-shape-in-use: silent on a declaration in today\'s shape', () => {
  assert.deepEqual(run({
    packs: ['basics', { id: 'node', config: { dirs: ['.'] }, version: '60902.1' }, 'local/own'],
    engineVersion: '60902.1',
    taskScheduler: { agenticTaskInvocationEndpoints: {} },
    servedBy: { mechanism: 'versioned' },
  }), []);
});

test('legacy-shape-in-use: an unparsable or non-object declaration asserts nothing', () => {
  assert.deepEqual(rule.run(ctx({ [SETTINGS_FILE]: 'not json' })), []);
  assert.deepEqual(rule.run(ctx({ [SETTINGS_FILE]: '[]' })), []);
});

test('legacy-shape-in-use: the retired declaration file name is reported by name', () => {
  const findings = run({ packs: ['basics'] }, { name: LEGACY_SETTINGS_FILE });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, LEGACY_SETTINGS_FILE);
  assert.match(findings[0].fix, new RegExp(`rename it to ${SETTINGS_FILE.replace('.', '\\.')}`));
});

test('legacy-shape-in-use: the retired top-level blocks and keys each get their own finding', () => {
  const findings = run({
    packs: ['basics'],
    claudinite: { note: 'no stamp here' },
    maintenance: { delivery: 'review' },
    packConfig: { node: {} },
    taskScheduler: { endpoints: {} },
  });
  const text = whats(findings);
  assert.match(text, /retired top-level "claudinite" block/);
  assert.match(text, /retired top-level "maintenance" block/);
  assert.match(text, /top-level "packConfig" map/);
  assert.match(text, /taskScheduler\.endpoints is the retired spelling/);
  assert.equal(findings.length, 4);
});

// The stamp and the block are two different edits; a `claudinite` block holding
// no versions is the config finding alone, not both.
test('legacy-shape-in-use: the stamp finding fires only where the block holds versions', () => {
  assert.equal(run({ packs: [], claudinite: { note: 'x' } }).length, 1);
  const stamped = run({ packs: [], claudinite: { engineVersion: '60902.1' } });
  assert.equal(stamped.length, 2);
  assert.match(whats(stamped), /version stamp still lives in the "claudinite" block/);
});

test('legacy-shape-in-use: a retired pack spelling is reported with the id that replaces it', () => {
  const [legacyId, canonical] = Object.entries(RENAMED_PACKS)[0];
  const findings = run({ packs: [legacyId] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, new RegExp(`"${legacyId}" names a pack that has been renamed`));
  assert.match(findings[0].fix, new RegExp(`declare "${canonical}"`));
});

test('legacy-shape-in-use: a local pack declared under the retired prefix names its new spelling', () => {
  const findings = run({ packs: [{ id: 'local_packs/own' }] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].fix, /declare it as "local\/own"/);
});

test('legacy-shape-in-use: integer versions are reported on the entry and on the engine stamp', () => {
  const findings = run({ packs: [{ id: 'basics', version: 7 }], engineVersion: 6 });
  assert.equal(findings.length, 2);
  assert.match(whats(findings), /"basics" is stamped with the pre-2026-08-20 integer version 7/);
  assert.match(whats(findings), /engineVersion is the pre-2026-08-20 integer 6/);
});

test('legacy-shape-in-use: the retired servedBy alias is reported, the current one is not', () => {
  assert.equal(run({ packs: [], servedBy: { mechanism: 'updates' } }).length, 1);
  assert.deepEqual(run({ packs: [], servedBy: { mechanism: 'versioned' } }), []);
});

// Every finding is advisory: the old shape works, so this may not stop a member's
// build over something that is not broken.
test('legacy-shape-in-use: never blocking', () => {
  const findings = run({ packs: ['core'], packConfig: {}, engineVersion: 6 });
  assert.ok(findings.length >= 3);
  assert.ok(findings.every((f) => f.severity === 'advisory'));
});
