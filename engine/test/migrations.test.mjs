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
  // 'manual', not 'auto': the fleet has vendored, but the record's references live
  // inline across the canon (barriers `except` entries, .github/workflows/README.md
  // links, this test) that the retire pass does not sweep — so auto-retiring it
  // strands them and breaks CI. Retire by hand alongside those references.
  assert.equal(m.retire, 'manual');
  assert.equal(m.retireDeletesFromHome.length, 8);
  assert.ok(m.retireDeletesFromHome.includes('.github/workflows/chrome-extension-release.yml'));
  // report-failure is shared canon infra (a non-chrome pack's coverage stub + the
  // general failure reporter reference it @main), so it must NOT be in the deletion set.
  assert.ok(!m.retireDeletesFromHome.includes('.github/actions/report-failure/action.yml'));

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

test('pack-entry-config migration: legacyPresent reads the declaration (true iff a top-level packConfig remains)', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'pack-entry-config');
  assert.ok(m, 'pack-entry-config migration is discovered');
  assert.equal(m.retire, 'manual'); // the tolerance is inline in loadConfig — dropped deliberately with the record
  const read = (json) => async () => JSON.stringify(json);
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['node'], packConfig: { node: {} } })), true, 'top-level packConfig -> legacy');
  assert.equal(await m.legacyPresent(() => false, read({ packs: [{ id: 'node', config: {} }] })), false, 'entry config -> done');
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['basics'] })), false, 'no params at all -> done');
  assert.equal(await m.legacyPresent(() => false, async () => null), false, 'no declaration -> not held');
  assert.equal(await m.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');
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

test('maintenance-delivery-rename migration: legacyPresent on push/auto/pr, and rewrites the stored value to auto-merge/review', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'maintenance-delivery-rename');
  assert.ok(m, 'maintenance-delivery-rename migration is discovered');
  assert.equal(m.retire, 'auto'); // the push/auto/pr aliases are permanent, so retiring the record strands nothing
  const cfg = (delivery) => async () => JSON.stringify({ packs: ['basics'], maintenance: { delivery } });
  assert.equal(await m.legacyPresent(() => false, cfg('push')), true, 'legacy push -> held');
  assert.equal(await m.legacyPresent(() => false, cfg('pr')), true, 'legacy pr -> held');
  assert.equal(await m.legacyPresent(() => false, cfg('auto')), true, 'legacy auto -> held');
  assert.equal(await m.legacyPresent(() => false, cfg('auto-merge')), false, 'auto-merge -> done');
  assert.equal(await m.legacyPresent(() => false, cfg('review')), false, 'review -> done');
  assert.equal(await m.legacyPresent(() => false, async () => null), false, 'no declaration -> not held');
  assert.equal(await m.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');

  // The declared rewrite renames both values in place (matching the JSON.stringify shape), idempotently.
  const repo = new Map([['.claudinite-checks.json',
    JSON.stringify({ packs: ['basics'], rules: {}, accept: [], maintenance: { delivery: 'push' } }, null, 2)]]);
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  assert.deepEqual(await applyRewrites(m, { read, write }), ['.claudinite-checks.json']);
  assert.equal(JSON.parse(repo.get('.claudinite-checks.json')).maintenance.delivery, 'auto-merge');
  assert.deepEqual(await applyRewrites(m, { read, write }), [], 'idempotent once renamed');

  const reviewRepo = new Map([['.claudinite-checks.json',
    JSON.stringify({ maintenance: { delivery: 'pr' } }, null, 2)]]);
  await applyRewrites(m, { read: (p) => reviewRepo.get(p) ?? null, write: (p, c) => reviewRepo.set(p, c) });
  assert.equal(JSON.parse(reviewRepo.get('.claudinite-checks.json')).maintenance.delivery, 'review');
});

test('local-pack-namespace migration: legacyPresent = a bare declared id whose pack lives in the member\'s local_packs', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'local-pack-namespace');
  assert.ok(m, 'local-pack-namespace migration is discovered');
  assert.equal(m.retire, 'auto'); // baselining does the write; this record only tracks convergence
  const read = (packs) => async () => JSON.stringify({ packs });
  const hasLocal = async (p) => p === '.claudinite/local_packs/proj/pack.mjs';
  // A bare string or entry-object id naming the member's own local pack → still legacy.
  assert.equal(await m.legacyPresent(hasLocal, read(['basics', 'proj'])), true, 'bare string -> legacy');
  assert.equal(await m.legacyPresent(hasLocal, read(['basics', { id: 'proj', config: {} }])), true, 'bare entry object -> legacy');
  // The namespaced form is converged, and a bare id that is no local pack is a canon declaration.
  assert.equal(await m.legacyPresent(hasLocal, read(['basics', 'local_packs/proj'])), false, 'namespaced -> done');
  assert.equal(await m.legacyPresent(async () => false, read(['basics', 'node'])), false, 'canon-only declaration -> done');
  assert.equal(await m.legacyPresent(hasLocal, async () => null), false, 'no declaration -> not held');
  assert.equal(await m.legacyPresent(hasLocal, async () => 'nope'), false, 'unparsable -> not held');
});

test('loadMigrations: the vendored-mount flip record carries its worker gate and stays out of the mechanical passes', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'vendored-mount-flip');
  assert.ok(m, 'flip record must be discovered');
  assert.equal(m.retire, 'manual');
  // Pilot gate: the worker converts only the repos this names (until 'fleet').
  assert.deepEqual(m.flip.repos, ['missingbulb/GoogleCalendarEventCreator']);
  assert.match(m.flip.steps, /ONE commit/);
  // No mechanical ops on purpose — fleet-apply must see a no-op.
  assert.equal(m.aliases, undefined);
  assert.equal(m.materialize, undefined);
  assert.equal(m.rewrite, undefined);
  // Telemetry: unflipped = still carrying the tracked sync hook.
  assert.equal(await m.legacyPresent(async (p) => p === '.claudinite/mount/sync-claudinite.sh'), true);
  assert.equal(await m.legacyPresent(async () => false), false);
});
