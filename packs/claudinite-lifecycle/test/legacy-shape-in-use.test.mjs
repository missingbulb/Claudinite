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
    packs: ['acme-pack', { id: 'node', config: { dirs: ['.'] }, version: '60902.1' }, 'local/own'],
    engineVersion: '60902.1',
    taskScheduler: { agenticTaskInvocationEndpoints: {} },
    servedBy: { mechanism: 'versioned' },
  }), []);
});

test('legacy-shape-in-use: an unparsable or non-object declaration asserts nothing', () => {
  assert.deepEqual(rule.run(ctx({ [SETTINGS_FILE]: 'not json' })), []);
  assert.deepEqual(rule.run(ctx({ [SETTINGS_FILE]: '[]' })), []);
});

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
  const findings = run({ packs: [{ id: 'acme-pack', version: 7 }], engineVersion: 6 });
  assert.equal(findings.length, 2);
  assert.match(whats(findings), /"acme-pack" is stamped with the pre-2026-08-20 integer version 7/);
  assert.match(whats(findings), /engineVersion is the pre-2026-08-20 integer 6/);
});

test('legacy-shape-in-use: the retired servedBy alias is reported, the current one is not', () => {
  assert.equal(run({ packs: [], servedBy: { mechanism: 'updates' } }).length, 1);
  assert.deepEqual(run({ packs: [], servedBy: { mechanism: 'versioned' } }), []);
});

// Every finding is advisory: the old shape works, so this may not stop a member's
// build over something that is not broken.
test('legacy-shape-in-use: never blocking', () => {
  const findings = run({ packs: [Object.keys(RENAMED_PACKS)[0]], dormant: true, engineVersion: 6 });
  assert.ok(findings.length >= 3);
  assert.ok(findings.every((f) => f.on_fail === 'advise'));
});

// The `severity` → `on_fail` rename: a member's settings overrides, its own local
// packs' declared checks and its own coded checks can each still spell the old way.
test('legacy-shape-in-use: an override still spelled "blocking" or "advisory" is reported with its new value', () => {
  const findings = run({ packs: [{ id: 'acme-pack', rules: { 'acme-check': 'advisory' } }], rules: { 'acme-other': 'blocking', 'acme-off': 'off', 'acme-new': 'advise' } });
  assert.equal(findings.length, 2);
  assert.match(whats(findings), /"acme-check" on the "acme-pack" pack entry is set to "advisory"/);
  assert.match(findings.find((f) => /acme-check/.test(f.what)).fix, /"advise"/);
  assert.match(findings.find((f) => /acme-other/.test(f.what)).fix, /"block"/);
});

test('legacy-shape-in-use: a local pack\'s declared check still carrying severity is reported, a vendored one is not', () => {
  const settings = JSON.stringify({ packs: ['local/acme-pack'] });
  const legacy = '[\n  {\n    "id": "acme-check",\n    "severity": "blocking"\n  }\n]\n';
  const findings = rule.run(ctx({
    [SETTINGS_FILE]: settings,
    '.claudinite/local/packs/acme-pack/declared-checks.json': legacy,
    '.claudinite/local/packs/acme-pack/skills/acme-skill/declared-checks.json': '[{ "id": "acme-new", "on_fail": "advise" }]',
    '.claudinite/shared/packs/acme-pack/declared-checks.json': legacy,
  }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, '.claudinite/local/packs/acme-pack/declared-checks.json');
  assert.equal(findings[0].line, 4);
  assert.match(findings[0].fix, /"on_fail": "block"/);
});

test('legacy-shape-in-use: a local pack\'s coded check still carrying severity is reported, a canon one is not', () => {
  const c = ctx({ [SETTINGS_FILE]: JSON.stringify({ packs: ['local/acme-pack'] }) });
  c.packs = [
    { id: 'local/acme-pack', local: true, dir: '/repo/.claudinite/local/packs/acme-pack', rules: [{ id: 'acme-check', severity: 'advisory' }, { id: 'acme-new', on_fail: 'block' }] },
    { id: 'acme-canon', local: false, rules: [{ id: 'acme-old', severity: 'blocking' }] },
  ];
  const findings = rule.run(c);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /"acme-check" in the local pack "local\/acme-pack" declares severity/);
  assert.match(findings[0].fix, /on_fail: 'advise'/);
});

test('legacy-shape-in-use: files left at the pre-flat and pre-usage paths are each reported', () => {
  const files = {
    [SETTINGS_FILE]: JSON.stringify({ packs: ['acme-pack'] }),
    '.claudinite/claudinite-rules.GENERATED.md': '@x\n',
    '.claudinite/local/usage.GENERATED.json': '{}',
    '.claudinite/local/dashboard/acme-pack.GENERATED.json': '{}',
    '.claudinite/local/packs/own/RULES.md': 'x',
    '.claudinite/usage/sessions-and-elements.json': '{}',
  };
  const found = rule.run({ ...ctx(files), tracked: Object.keys(files) }).map((f) => f.file).sort();
  assert.deepEqual(found, [
    '.claudinite/claudinite-rules.GENERATED.md',
    '.claudinite/local/dashboard/acme-pack.GENERATED.json',
    '.claudinite/local/usage.GENERATED.json',
  ]);
});
