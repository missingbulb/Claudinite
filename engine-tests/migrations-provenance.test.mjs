import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import { applyProvenanceMarking, applyMigration } from '../engine/migrations/registry.mjs';
import { checkoutIo, auditPack } from '../engine/checks/helpers/provenance.mjs';

// The `markProvenance` op: a member's local packs are put onto the provenance
// convention at converge — references docs converted, rules marked, bodies
// declared, files created — through the registry's io, so nobody has to remember.

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-mark-op-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};

const MEMBER = {
  '.claudinite-settings.json': '{ "packs": ["acme-pack-f", "local/mypack"] }\n',
  '.claudinite/local/packs/mypack/pack.mjs': 'export default {};\n',
  '.claudinite/local/packs/mypack/RULES.md': '- **Doing a thing** — the settled way. (3)\n\n- **Doing another** — plainly.\n',
  '.claudinite/local/packs/mypack/references.md': '- **(RULES-3)** The other way failed twice (#12). Retire when the platform accepts it.\n',
  '.claudinite/local/packs/mypack/skills/how/SKILL.md': '---\nname: how\n---\n\n1. First.\n2. Then.\n',
  '.claudinite/local/packs/notapack/README.md': 'no manifest here\n',
  '.claudinite/shared/packs/acme-pack/RULES.md': '- **Vendored** — never touched.\n',
};

test('markProvenance converts each local pack\'s references doc, marks its rules, declares its skills and creates its files', async () => {
  const root = repo(MEMBER);
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    const applied = await applyProvenanceMarking({ id: 'm', markProvenance: true }, io);
    assert.ok(applied.some((l) => /references\.md: converted and deleted/.test(l)), applied.join('\n'));
    assert.ok(applied.some((l) => /"Doing another" marked \(doing-another\)/.test(l)));
    assert.ok(applied.some((l) => /skills\/how\/SKILL\.md: body: workflow proposed/.test(l)));
    const rules = readFileSync(join(root, '.claudinite/local/packs/mypack/RULES.md'), 'utf8');
    assert.match(rules, /the settled way\. \(doing-thing\)\n/);
    assert.match(rules, /plainly\. \(doing-another\)\n/);
    assert.ok(!existsSync(join(root, '.claudinite/local/packs/mypack/references.md')));
    const entry = readFileSync(join(root, '.claudinite/local/packs/mypack/provenance/doing-thing.md'), 'utf8');
    assert.match(entry, /· born · converted from references\.md \(RULES-3\), dated by the conversion\n/);
    assert.match(entry, /Retire when:\*\* Retire when the platform accepts it\./);
    for (const f of ['doing-another', 'how', '_pack']) assert.ok(existsSync(join(root, `.claudinite/local/packs/mypack/provenance/${f}.md`)), f);
    assert.ok(!existsSync(join(root, '.claudinite/local/packs/notapack/provenance')), 'a folder with no manifest is not a pack');
    assert.equal(readFileSync(join(root, '.claudinite/shared/packs/acme-pack/RULES.md'), 'utf8'), MEMBER['.claudinite/shared/packs/acme-pack/RULES.md'], 'the mount is never touched');
    const audit = auditPack('.claudinite/local/packs/mypack', io);
    assert.deepEqual(audit.unmarked, []);
    assert.deepEqual(audit.dangling, []);
    assert.deepEqual(audit.noBody, []);
    assert.equal(audit.referencesDoc, null);
    assert.deepEqual(await applyProvenanceMarking({ id: 'm', markProvenance: true }, io), [], 'idempotent on the next converge');
  } finally { removeTree(root); }
});

test('markProvenance rides applyMigration like every other op, and is inert without the flag, without listDir, or where appliesTo says no', async () => {
  const root = repo(MEMBER);
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    assert.deepEqual(await applyProvenanceMarking({ id: 'm' }, io), []);
    const { listDir, ...noList } = io;
    assert.deepEqual(await applyProvenanceMarking({ id: 'm', markProvenance: true }, noList), [], 'a caller that cannot list marks nothing rather than half-marking');
    assert.deepEqual(await applyProvenanceMarking({ id: 'm', markProvenance: true, appliesTo: async () => false }, io), []);
    assert.ok(existsSync(join(root, '.claudinite/local/packs/mypack/references.md')), 'nothing ran');
    const applied = await applyMigration({ id: 'm', landed: '2026-09-21', markProvenance: true, aliases: [] }, io);
    assert.ok(applied.some((l) => /marked \(doing-another\)/.test(l)), applied.join('\n'));
  } finally { removeTree(root); }
});
