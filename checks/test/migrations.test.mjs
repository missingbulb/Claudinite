import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadMigrations, resolvePath, applyFileAliases, retirableMigrations,
} from '../../migrations/registry.mjs';

const M = (over = {}) => ({ id: 'm', landed: '2026-01-01', aliases: [], ...over });

test('resolvePath: prefers canonical then legacy; an unknown target resolves to itself', () => {
  const migs = [M({ aliases: [{ canonical: 'a/new.sh', legacy: ['a/old.sh', 'a/older.sh'] }] })];
  assert.deepEqual(resolvePath(migs, 'a/new.sh'), ['a/new.sh', 'a/old.sh', 'a/older.sh']);
  assert.deepEqual(resolvePath(migs, 'unrelated'), ['unrelated']);
});

test('applyFileAliases: renames legacy->canonical only when legacy exists and canonical does not', async () => {
  const present = new Set(['a/old.sh']);
  const moves = [];
  const exists = (p) => present.has(p);
  const move = (from, to) => { present.delete(from); present.add(to); moves.push(`${from}->${to}`); };
  const m = M({ aliases: [{ canonical: 'a/new.sh', legacy: ['a/old.sh'] }] });
  assert.deepEqual(await applyFileAliases(m, { exists, move }), ['a/old.sh -> a/new.sh']);
  assert.ok(present.has('a/new.sh') && !present.has('a/old.sh'));
  // Idempotent: a second run is a no-op (canonical now exists, legacy gone).
  assert.deepEqual(await applyFileAliases(m, { exists, move }), []);
});

test('applyFileAliases: never clobbers — no-op when the canonical already exists', async () => {
  const present = new Set(['a/old.sh', 'a/new.sh']);
  const exists = (p) => present.has(p);
  const move = () => { throw new Error('must not move when the canonical already exists'); };
  const m = M({ aliases: [{ canonical: 'a/new.sh', legacy: ['a/old.sh'] }] });
  assert.deepEqual(await applyFileAliases(m, { exists, move }), []);
});

test('retirableMigrations: retires a clean, aged, auto migration', () => {
  const migs = [M({ id: 'done', landed: '2026-07-12' })];
  const pending = new Map([['done', 0]]);
  const out = retirableMigrations(migs, { pending, unknownCount: 0, today: '2026-07-13' });
  assert.deepEqual(out.map((m) => m.id), ['done']);
});

test('retirableMigrations: blocked by unknowns, pending repos, same-day landing, and retire:manual', () => {
  const base = M({ id: 'x', landed: '2026-07-12' });
  const clean = new Map([['x', 0]]);
  // Any unclassified repo blocks every retirement — an error can't hide a holdout.
  assert.deepEqual(retirableMigrations([base], { pending: clean, unknownCount: 1, today: '2026-07-13' }), []);
  // A repo still carrying the legacy shape blocks.
  assert.deepEqual(retirableMigrations([base], { pending: new Map([['x', 1]]), unknownCount: 0, today: '2026-07-13' }), []);
  // Landed today (< one nightly cycle old) blocks.
  assert.deepEqual(retirableMigrations([base], { pending: clean, unknownCount: 0, today: '2026-07-12' }), []);
  // retire:'manual' opts out entirely.
  const manual = M({ id: 'x', landed: '2026-07-12', retire: 'manual' });
  assert.deepEqual(retirableMigrations([manual], { pending: clean, unknownCount: 0, today: '2026-07-13' }), []);
});

test('loadMigrations: discovers the mount-folder relocation with its source file and probe', async () => {
  const migs = await loadMigrations();
  const seed = migs.find((m) => m.id === 'mount-folder-relocation');
  assert.ok(seed, 'mount-folder-relocation migration is discovered');
  assert.equal(seed.file, '2026-07-13-mount-folder-relocation.mjs');
  assert.equal(typeof seed.legacyPresent, 'function');
  assert.equal(seed.retire, 'manual');
  // Its probe reports still-legacy when ANY pre-mount sync-hook shape is present, clean otherwise.
  assert.equal(await seed.legacyPresent((p) => p === '.claudinite/sync-claudinite.sh'), true);
  assert.equal(await seed.legacyPresent((p) => p === '.claude/hooks/sync-claudinite.sh'), true);
  assert.equal(await seed.legacyPresent(() => false), false);
});

test('tidy-repo-seed migration: legacyPresent reads the declaration (true iff tidy-repo absent)', async () => {
  const seed = (await loadMigrations()).find((m) => m.id === 'tidy-repo-seed');
  assert.ok(seed, 'tidy-repo-seed migration is discovered');
  assert.equal(seed.retire, 'auto');
  const read = (packs) => async () => JSON.stringify({ packs });
  assert.equal(await seed.legacyPresent(() => false, read(['basics'])), true, 'lacks tidy-repo -> legacy');
  assert.equal(await seed.legacyPresent(() => false, read(['basics', 'tidy-repo'])), false, 'has it -> done');
  assert.equal(await seed.legacyPresent(() => false, async () => null), false, 'no declaration -> not held');
  assert.equal(await seed.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');
});
