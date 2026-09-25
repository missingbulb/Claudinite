import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { applyFileAliases } from '../../../../engine/migrations/registry.mjs';
import { removeTree } from '../../../../engine/remove-tree.mjs';
import tasksRecord from '../../migrations/2026-09-25-rolling-usage-files/migration.mjs';
import growthRecord from '../../../claudinite-growth/migrations/2026-09-25-rolling-review-files/migration.mjs';

// The records run through the registry's own alias op over a real directory: what a
// member's converge does to its rolling files is exactly this.
const io = (root) => ({
  exists: async (p) => existsSync(join(root, p)),
  move: async (from, to) => { mkdirSync(dirname(join(root, to)), { recursive: true }); renameSync(join(root, from), join(root, to)); },
});
const put = (root, p, text) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), text); };

for (const record of [tasksRecord, growthRecord]) {
  test(`${record.id}: every old file arrives at its new path with its bytes, and the old path is empty`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'rolling-'));
    try {
      const pairs = record.aliases.map((a) => [a.legacy[0], a.canonical]);
      for (const [legacy] of pairs) put(root, legacy, `history of ${legacy}\n`);
      assert.equal(await record.legacyPresent(io(root).exists), true);
      await applyFileAliases(record, io(root));
      for (const [legacy, canonical] of pairs) {
        assert.equal(readFileSync(join(root, canonical), 'utf8'), `history of ${legacy}\n`);
        assert.equal(existsSync(join(root, legacy)), false);
      }
      assert.equal(await record.legacyPresent(io(root).exists), false);
    } finally { removeTree(root); }
  });

  test(`${record.id}: where the new path already exists, neither file is touched`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'rolling-'));
    try {
      const [{ canonical, legacy: [legacy] }] = record.aliases;
      put(root, legacy, 'old\n');
      put(root, canonical, 'new\n');
      await applyFileAliases(record, io(root));
      assert.equal(readFileSync(join(root, legacy), 'utf8'), 'old\n');
      assert.equal(readFileSync(join(root, canonical), 'utf8'), 'new\n');
    } finally { removeTree(root); }
  });
}
