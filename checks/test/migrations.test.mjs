import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadMigrations, resolvePath, applyFileAliases, retirableMigrations,
  applyMaterializations, applyRewrites, migrationActive,
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
  // Applied to >=1 repo THIS cycle blocks (the quiescence guard): the cycle that
  // converges the last member can never also retire it.
  assert.deepEqual(
    retirableMigrations([base], { pending: clean, unknownCount: 0, today: '2026-07-13', appliedThisCycle: new Set(['x']) }),
    [],
  );
  // ...but a clean cycle where it was applied to no one retires it.
  assert.deepEqual(
    retirableMigrations([base], { pending: clean, unknownCount: 0, today: '2026-07-13', appliedThisCycle: new Set() }).map((m) => m.id),
    ['x'],
  );
});

test('applyMaterializations: creates a dest from its template when missing or drifted; skips when equal; gated by appliesTo', async () => {
  const store = new Map([['tpl/a.yml', 'AAA'], ['tpl/b.yml', 'BBB']]);
  const repo = new Map();
  const readTemplate = (p) => store.get(p) ?? null;
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  const m = M({ materialize: [
    { template: 'tpl/a.yml', dest: '.github/a.yml' },
    { template: 'tpl/b.yml', dest: '.github/b.yml' },
  ] });
  // First pass creates both.
  assert.deepEqual(
    (await applyMaterializations(m, { readTemplate, read, write })).sort(),
    ['.github/a.yml <- tpl/a.yml', '.github/b.yml <- tpl/b.yml'],
  );
  // Idempotent: unchanged -> no-op.
  assert.deepEqual(await applyMaterializations(m, { readTemplate, read, write }), []);
  // Drift heals: a hand-edited copy is rewritten from the template.
  repo.set('.github/a.yml', 'edited');
  assert.deepEqual(await applyMaterializations(m, { readTemplate, read, write }), ['.github/a.yml <- tpl/a.yml']);
  assert.equal(repo.get('.github/a.yml'), 'AAA');
  // A missing template is skipped, never written as nothing.
  const missing = M({ materialize: [{ template: 'tpl/none.yml', dest: '.github/none.yml' }] });
  assert.deepEqual(await applyMaterializations(missing, { readTemplate, read, write }), []);
  assert.equal(repo.has('.github/none.yml'), false);
  // appliesTo:false skips entirely.
  const gated = M({ appliesTo: async () => false, materialize: [{ template: 'tpl/a.yml', dest: '.github/c.yml' }] });
  assert.deepEqual(await applyMaterializations(gated, { readTemplate, read, write }), []);
  assert.equal(repo.has('.github/c.yml'), false);
});

test('applyRewrites: applies literal from->to replacements in place, idempotently, gated by appliesTo', async () => {
  const repo = new Map([['.github/w.yml', 'uses: X@main\nkeep me\nuses: Y@main\n']]);
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  const m = M({ rewrite: [{ file: '.github/w.yml', replace: [
    { from: 'X@main', to: './x' }, { from: 'Y@main', to: './y' },
  ] }] });
  assert.deepEqual(await applyRewrites(m, { read, write }), ['.github/w.yml']);
  assert.equal(repo.get('.github/w.yml'), 'uses: ./x\nkeep me\nuses: ./y\n');
  // Idempotent: nothing left to replace.
  assert.deepEqual(await applyRewrites(m, { read, write }), []);
  // appliesTo:false skips (the untouched marker survives).
  const gated = M({ appliesTo: async () => false, rewrite: [{ file: '.github/w.yml', replace: [{ from: 'keep me', to: 'gone' }] }] });
  assert.deepEqual(await applyRewrites(gated, { read, write }), []);
  assert.match(repo.get('.github/w.yml'), /keep me/);
});

test('migrationActive: true while a migration file carrying the slug is present, false otherwise', () => {
  assert.equal(migrationActive('chrome-release-vendoring'), true);
  assert.equal(migrationActive('no-such-migration-slug'), false);
});

test('chrome-release-vendoring migration: gate, telemetry, and the home-file retirement list', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'chrome-release-vendoring');
  assert.ok(m, 'discovered');
  assert.equal(m.retire, 'auto');
  assert.equal(m.retireDeletesFromHome.length, 9);
  assert.ok(m.retireDeletesFromHome.includes('.github/workflows/chrome-extension-release.yml'));
  assert.ok(m.retireDeletesFromHome.includes('.github/actions/report-failure/action.yml'));

  const orchestrator = (uses) => `name: Release to Chrome Store\njobs:\n  cp:\n    uses: ${uses}\n`;
  const legacy = orchestrator('missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main');
  const vendored = orchestrator('./.github/workflows/chrome-extension-create-package.yml');
  const readStub = (text) => async (p) => (p === '.github/workflows/chrome-extension-release.yml' ? text : null);

  // appliesTo: only where the orchestrator is named "Release to Chrome Store".
  assert.equal(await m.appliesTo(async () => legacy), true);
  assert.equal(await m.appliesTo(async () => 'name: "Chrome extension: Create Package (reusable)"\n'), false);
  assert.equal(await m.appliesTo(async () => null), false);

  // legacyPresent: still legacy while the orchestrator references core @main.
  assert.equal(await m.legacyPresent(() => false, readStub(legacy)), true);
  assert.equal(await m.legacyPresent(() => false, readStub(vendored)), false);
  assert.equal(await m.legacyPresent(() => false, readStub(null)), false);

  // Its declared rewrites and materializations round-trip a legacy orchestrator +
  // empty repo to the fully vendored shape (template contents stubbed in).
  const repo = new Map([['.github/workflows/chrome-extension-release.yml', legacy]]);
  const readTemplate = (p) => `TEMPLATE:${p}`;
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  await applyMaterializations(m, { readTemplate, read, write });
  await applyRewrites(m, { read, write });
  assert.equal(repo.size, 10, 'orchestrator + 9 vendored files');
  assert.match(repo.get('.github/workflows/chrome-extension-release.yml'), /\.\/\.github\/workflows\/chrome-extension-create-package\.yml/);
  assert.ok(!repo.get('.github/workflows/chrome-extension-release.yml').includes('missingbulb/Claudinite'));
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
