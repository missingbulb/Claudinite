import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-shape-in-use.mjs';
import { SETTINGS_FILE } from '../../../engine/settings-file-names.mjs';
import { RENAMED_PACKS } from '../../../engine/pack_loader/renamed-packs.mjs';

// A ctx over an in-memory file map — no git, no fixture tree.
const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const run = (declaration) => rule.run(ctx({ [SETTINGS_FILE]: JSON.stringify(declaration) }));
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

// The shapes #1640 removed are read by nothing now, so the settings-validity gate
// reports them as blocking unknown settings and this advisory says nothing about
// them — a second, milder voice on a member that is already failing its own run.
test('legacy-shape-in-use: the shapes #1640 removed are no longer this advisory\'s', () => {
  assert.deepEqual(run({
    packs: ['basics'],
    claudinite: { engineVersion: '60902.1' },
    maintenance: { delivery: 'review' },
    packConfig: { node: {} },
    taskScheduler: { endpoints: {} },
  }), []);
});

// The one top-level key still merely tolerated (#1846): it is accepted on the way
// in, read by the scheduler's own pack, and the advisory is what says to move it.
test('legacy-shape-in-use: the retired top-level dormant key is reported', () => {
  const findings = run({ packs: ['basics'], dormant: true });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /retired top-level "dormant" block/);
});

test('legacy-shape-in-use: a retired pack spelling is reported with the id that replaces it', () => {
  const [legacyId, canonical] = Object.entries(RENAMED_PACKS)[0];
  const findings = run({ packs: [legacyId] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, new RegExp(`"${legacyId}" names a pack that has been renamed`));
  assert.match(findings[0].fix, new RegExp(`declare "${canonical}"`));
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
  const findings = run({ packs: ['core'], dormant: true, engineVersion: 6 });
  assert.ok(findings.length >= 3);
  assert.ok(findings.every((f) => f.severity === 'advisory'));
});
