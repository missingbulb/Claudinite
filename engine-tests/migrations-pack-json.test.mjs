import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import { applyManifestsToJson, applyMigration } from '../engine/migrations/registry.mjs';
import { manifestToJson } from '../engine/migrations/manifests-to-json.mjs';
import { checkoutIo } from '../engine/checks/helpers/provenance.mjs';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';
import record from '../engine/migrations/2026-09-28-pack-json-manifests/migration.mjs';

// The `manifestsToJson` op: a member's own local packs move from a pack.mjs module to a
// pack.json at update, and a manifest the conversion cannot carry as data stays a module,
// which the loader still reads. The vendored mount is never its business.

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-pack-json-op-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};
const LOCAL = '.claudinite/local/packs';
const OP = { id: 'm', manifestsToJson: true };

const PLAIN = `// acme-pack: the member's own pack.
export default {
  version: 1,
  ruleRoutingGuidance: {
    belongs: 'everything specific to this repository',
    excludes: 'anything portable', // a trailing comment
  },
  worldRules: [],
  requires: ['basics'],
};
`;
const DETECTED = "export default {\n  ruleRoutingGuidance: { belongs: 'b', excludes: 'e' },\n  relevanceDetector: { about: 'a marker', paths: /^marker\\.txt$/, text: /^MARK/m, search: ['MARK'] },\n};\n";
const WITH_CODE = "export default {\n  ruleRoutingGuidance: { belongs: 'b', excludes: 'e' },\n  env: { label: 'x', setup: (p) => 'true', probe: 'true' },\n};\n";
const IMPORTING = "import rule from './rule.mjs';\nexport default { ruleRoutingGuidance: { belongs: 'b', excludes: 'e' }, worldRules: [rule] };\n";

test('manifestToJson: the evaluated manifest as JSON, key order kept and patterns as strings or { source, flags }', async () => {
  assert.deepEqual(JSON.parse((await manifestToJson(PLAIN)).json), {
    version: 1,
    ruleRoutingGuidance: { belongs: 'everything specific to this repository', excludes: 'anything portable' },
    worldRules: [],
    requires: ['basics'],
  });
  assert.deepEqual(Object.keys(JSON.parse((await manifestToJson(PLAIN)).json)), ['version', 'ruleRoutingGuidance', 'worldRules', 'requires']);
  assert.deepEqual(JSON.parse((await manifestToJson(DETECTED)).json).relevanceDetector,
    { about: 'a marker', paths: '^marker\\.txt$', text: { source: '^MARK', flags: 'm' }, search: ['MARK'] });
  assert.match((await manifestToJson(WITH_CODE)).why, /env\.setup is a function/);
  assert.match((await manifestToJson(IMPORTING)).why, /./);
});

test('manifestsToJson converts each local pack.mjs it can carry as data, and leaves the rest and the mount alone', async () => {
  const root = repo({
    [`${LOCAL}/plain/pack.mjs`]: PLAIN,
    [`${LOCAL}/plain/RULES.md`]: '# plain\n',
    [`${LOCAL}/detected/pack.mjs`]: DETECTED,
    [`${LOCAL}/coded/pack.mjs`]: WITH_CODE,
    [`${LOCAL}/importing/pack.mjs`]: IMPORTING,
    [`${LOCAL}/importing/rule.mjs`]: "export default { id: 'r', run: () => [] };\n",
    [`${LOCAL}/done/pack.json`]: '{ "ruleRoutingGuidance": { "belongs": "b", "excludes": "e" } }\n',
    '.claudinite/shared/packs/acme-canon/pack.mjs': PLAIN,
  });
  try {
    const io = checkoutIo(root);
    const applied = await applyManifestsToJson(OP, io);
    assert.equal(applied.filter((a) => /-> pack\.json/.test(a)).length, 2, applied.join('\n'));
    assert.equal(applied.filter((a) => /kept as pack\.mjs/.test(a)).length, 2, applied.join('\n'));

    for (const name of ['plain', 'detected']) {
      assert.equal(existsSync(join(root, LOCAL, name, 'pack.mjs')), false, name);
      assert.ok(existsSync(join(root, LOCAL, name, 'pack.json')), name);
    }
    for (const name of ['coded', 'importing']) {
      assert.ok(existsSync(join(root, LOCAL, name, 'pack.mjs')), name);
      assert.equal(existsSync(join(root, LOCAL, name, 'pack.json')), false, name);
    }
    assert.ok(existsSync(join(root, '.claudinite/shared/packs/acme-canon/pack.mjs')), 'the mount moves with its own update');

    // The converted packs load to what their modules loaded to.
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.deepEqual(errors, []);
    const detected = packs.find((p) => p.id === 'detected');
    assert.ok(detected.relevanceDetector.text.test('x\nMARK'));
    assert.ok(!detected.relevanceDetector.paths.test('a/marker.txt'));
    assert.deepEqual(packs.find((p) => p.id === 'plain').requires, ['basics']);

    assert.deepEqual((await applyManifestsToJson(OP, io)).filter((a) => /-> pack\.json/.test(a)), [], 'idempotent on the next update');
  } finally { removeTree(root); }
});

test('manifestsToJson writes nothing through an io that cannot list or remove', async () => {
  const root = repo({ [`${LOCAL}/plain/pack.mjs`]: PLAIN });
  try {
    const { listDir, remove, ...rest } = checkoutIo(root);
    assert.deepEqual(await applyManifestsToJson(OP, rest), []);
    assert.deepEqual(await applyManifestsToJson(OP, { ...rest, listDir }), []);
    assert.ok(existsSync(join(root, LOCAL, 'plain', 'pack.mjs')));
  } finally { removeTree(root); }
});

test('the pack-json record waits for a mount whose engine reads pack.json, and the applier runs it', async () => {
  const member = (engineText) => repo({
    [`${LOCAL}/plain/pack.mjs`]: PLAIN,
    ...(engineText === null ? {} : { '.claudinite/shared/engine/pack_loader/pack-conventions.mjs': engineText }),
  });
  for (const [engineText, converts] of [[null, false], ["export const PROSE_FILE = 'RULES.md';\n", false], [readFileSync('engine/pack_loader/pack-conventions.mjs', 'utf8'), true]]) {
    const root = member(engineText);
    try {
      const applied = await applyMigration(record, checkoutIo(root));
      assert.equal(existsSync(join(root, LOCAL, 'plain', 'pack.json')), converts, applied.join('\n'));
    } finally { removeTree(root); }
  }
});
