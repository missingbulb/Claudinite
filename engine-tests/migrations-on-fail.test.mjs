import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import { applyOnFailRename, applyMigration } from '../engine/migrations/registry.mjs';
import { checkoutIo } from '../engine/checks/helpers/provenance.mjs';

// The `renameOnFail` op: the member's own files move from `severity: blocking |
// advisory` to `on_fail: block | advise` at update, so nobody has to act on the
// advisory for the ordinary case. The vendored mount is never its business.

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-on-fail-op-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};

const CODED = "const rule = {\n  id: 'acme-check',\n  severity: 'advisory',\n  run(ctx) { return [finding(rule, { file: 'a', what: 'w', fix: 'f', severity: \"blocking\" })]; },\n};\n";
const MEMBER = {
  '.claudinite-settings.json': JSON.stringify({
    packs: ['local/acme-pack', { id: 'acme-canon', rules: { 'acme-a': 'blocking', 'acme-b': 'off' } }],
    rules: { 'acme-c': 'advisory', 'acme-d': 'block' },
  }, null, 2) + '\n',
  '.claudinite/local/packs/acme-pack/pack.mjs': 'export default {};\n',
  '.claudinite/local/packs/acme-pack/declared-checks.json': '[\n  {\n    "id": "acme-declared",\n    "severity": "blocking",\n    "failureMessage": "a severity nobody reads"\n  }\n]\n',
  '.claudinite/local/packs/acme-pack/skills/acme-skill/declared-checks.json': '[{ "id": "acme-skill-check", "severity" : "advisory" }]\n',
  '.claudinite/local/packs/acme-pack/worldRules/acme-check.mjs': CODED,
  '.claudinite/local/packs/acme-pack/test/acme-check.test.mjs': "assert.equal(f.severity, 'advisory');\nconst fixture = { severity: 'advisory' };\n",
  '.claudinite/shared/packs/acme-canon/declared-checks.json': '[{ "id": "vendored", "severity": "blocking" }]\n',
};
const read = (root, p) => readFileSync(join(root, p), 'utf8');

test('renameOnFail rewrites the settings overrides, local declared checks and local coded checks, and nothing else', async () => {
  const root = repo(MEMBER);
  try {
    const io = checkoutIo(root);
    const applied = await applyOnFailRename({ id: 'm', renameOnFail: true }, io);
    assert.equal(applied.length, 4, applied.join('\n'));

    const settings = JSON.parse(read(root, '.claudinite-settings.json'));
    assert.deepEqual(settings.rules, { 'acme-c': 'advise', 'acme-d': 'block' });
    assert.deepEqual(settings.packs[1].rules, { 'acme-a': 'block', 'acme-b': 'off' });

    assert.match(read(root, '.claudinite/local/packs/acme-pack/declared-checks.json'), /\n    "on_fail": "block",\n    "failureMessage": "a severity nobody reads"/);
    assert.equal(read(root, '.claudinite/local/packs/acme-pack/skills/acme-skill/declared-checks.json'), '[{ "id": "acme-skill-check", "on_fail" : "advise" }]\n');
    assert.equal(read(root, '.claudinite/local/packs/acme-pack/worldRules/acme-check.mjs'),
      CODED.replace("severity: 'advisory'", "on_fail: 'advise'").replace('severity: "blocking"', 'on_fail: "block"'));

    assert.equal(read(root, '.claudinite/local/packs/acme-pack/test/acme-check.test.mjs'), MEMBER['.claudinite/local/packs/acme-pack/test/acme-check.test.mjs'], 'a test is the member\'s own assertion, left alone');
    assert.equal(read(root, '.claudinite/shared/packs/acme-canon/declared-checks.json'), MEMBER['.claudinite/shared/packs/acme-canon/declared-checks.json'], 'the mount moves with its own update');

    assert.deepEqual(await applyOnFailRename({ id: 'm', renameOnFail: true }, io), [], 'idempotent on the next update');
  } finally { removeTree(root); }
});

test('renameOnFail rides applyMigration, and is inert without the flag, without listDir, or where appliesTo says no', async () => {
  const root = repo(MEMBER);
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    assert.deepEqual(await applyOnFailRename({ id: 'm' }, io), []);
    const { listDir, ...noList } = io;
    assert.deepEqual(await applyOnFailRename({ id: 'm', renameOnFail: true }, noList), [], 'a caller that cannot list rewrites nothing rather than half-rewriting');
    assert.deepEqual(await applyOnFailRename({ id: 'm', renameOnFail: true, appliesTo: async () => false }, io), []);
    assert.match(read(root, '.claudinite-settings.json'), /"advisory"/, 'nothing ran');
    const applied = await applyMigration({ id: 'm', landed: '2026-09-25', renameOnFail: true, aliases: [] }, io);
    assert.equal(applied.length, 4, applied.join('\n'));
  } finally { removeTree(root); }
});
