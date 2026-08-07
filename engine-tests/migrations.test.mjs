import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadMigrations, resolvePath, applyFileAliases, retirableMigrations,
  migrationsPastTtl, MIGRATIONS_OLD_SUBDIR,
  applyMaterializations, applyRewrites, applyPackDeclarations, migrationActive,
  migrationAgentic, agenticMigrations,
  callerCanDeliverWorkflows, WITHHOLD_CAPABLE_ENV,
} from '../migrations/registry.mjs';
import { specFiles, oldSpecFiles } from '../engine/checks/helpers/active-migrations.mjs';

const M = (over = {}) => ({ id: 'm', landed: '2026-01-01', aliases: [], ...over });

test('migrationAgentic: null when absent, the validated note when well-formed', () => {
  assert.equal(migrationAgentic(M()), null);
  const note = { model: 'sonnet', instructions: 'adapt the local pack' };
  assert.deepEqual(migrationAgentic(M({ agentic: note })), note);
});

test('migrationAgentic: throws on a malformed note (a typo fails loudly, never silent-skips)', () => {
  assert.throws(() => migrationAgentic(M({ agentic: { instructions: 'x' } })), /model must be a non-"none"/);
  assert.throws(() => migrationAgentic(M({ agentic: { model: 'none', instructions: 'x' } })), /non-"none"/);
  assert.throws(() => migrationAgentic(M({ agentic: { model: 'sonnet', instructions: '  ' } })), /instructions must be a non-empty string/);
  assert.throws(() => migrationAgentic(M({ agentic: 'sonnet' })), /must be an object/);
});

test('agenticMigrations: selects exactly the records carrying a valid agentic note', () => {
  const migs = [M({ id: 'a' }), M({ id: 'b', agentic: { model: 'opus', instructions: 'do the thing' } })];
  assert.deepEqual(agenticMigrations(migs).map((m) => m.id), ['b']);
});

test('the real pack-independence record carries a valid agentic note', async () => {
  const migs = await loadMigrations();
  const pi = migs.find((m) => m.id === 'pack-independence');
  assert.ok(pi, 'pack-independence record present');
  assert.equal(migrationAgentic(pi).model, 'sonnet');
});

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

test('retirableMigrations: never fleet-deletes an already-archived (migrations-old) record', () => {
  const archived = M({ id: 'x', landed: '2026-07-12', subdir: MIGRATIONS_OLD_SUBDIR });
  const clean = new Map([['x', 0]]);
  assert.deepEqual(retirableMigrations([archived], { pending: clean, unknownCount: 0, today: '2026-07-20' }), []);
});

// --- migrationsPastTtl (the TTL archiver's selection) ------------------------

test('migrationsPastTtl: selects records older than the TTL, skips younger and archived', () => {
  const migs = [
    M({ id: 'old', landed: '2026-07-01' }),      // 14 days before today → past a 7d TTL
    M({ id: 'young', landed: '2026-07-13' }),    // 2 days → within TTL
    M({ id: 'edge', landed: '2026-07-08' }),     // exactly 7 days → at the TTL (aged out)
    M({ id: 'gone', landed: '2026-07-01', subdir: MIGRATIONS_OLD_SUBDIR }), // already archived
  ];
  const out = migrationsPastTtl(migs, { today: '2026-07-15', ttlDays: 7 });
  assert.deepEqual(out.map((m) => m.id).sort(), ['edge', 'old']);
});

test('migrationsPastTtl: an empty set when nothing has aged out', () => {
  const migs = [M({ id: 'a', landed: '2026-07-14' }), M({ id: 'b', landed: '2026-07-15' })];
  assert.deepEqual(migrationsPastTtl(migs, { today: '2026-07-15', ttlDays: 7 }), []);
});

test('retire gates deletion, not archival: the TTL sweep takes a manual record, retirableMigrations does not', () => {
  // The two passes are deliberately split. Archiving moves a record to
  // migrations-old/, where it still loads and still applies for a dormant
  // project's backfill — only its legacy tolerance ends. Deleting drops it for
  // good, which is what `retire: 'manual'` exists to stop until a human sweeps
  // the references the pass cannot reach.
  const migs = [
    M({ id: 'auto-old', landed: '2026-07-01', retire: 'auto' }),
    M({ id: 'manual-old', landed: '2026-07-01', retire: 'manual' }),
    M({ id: 'unset-old', landed: '2026-07-01' }),
  ];
  const archived = migrationsPastTtl(migs, { today: '2026-07-15', ttlDays: 7 });
  assert.deepEqual(archived.map((m) => m.id).sort(), ['auto-old', 'manual-old', 'unset-old']);
  const deletable = retirableMigrations(migs, {
    pending: new Map(), unknownCount: 0, today: '2026-07-15',
  });
  assert.deepEqual(deletable.map((m) => m.id).sort(), ['auto-old', 'unset-old']);
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

test('applyPackDeclarations: declares an absent pack, never overrides what the repo chose, gated by appliesTo', async () => {
  const decl = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const repo = new Map([['.claudinite-checks.json', decl({ packs: ['basics'], maintenance: { delivery: 'auto-merge' } })]]);
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  const m = M({ declarePacks: [{ id: 'NewPack', config: { repo: 'o/store' } }] });

  assert.deepEqual(await applyPackDeclarations(m, { read, write }), ['.claudinite-checks.json: declared NewPack']);
  const after = JSON.parse(repo.get('.claudinite-checks.json'));
  assert.deepEqual(after.packs, ['basics', { id: 'NewPack', config: { repo: 'o/store' } }]);
  assert.deepEqual(after.maintenance, { delivery: 'auto-merge' }, 'the rest of the declaration survives');
  assert.equal(repo.get('.claudinite-checks.json'), decl(after), 'canonical 2-space settings with a trailing newline');

  // Idempotent, and — the contract that matters — a pack the repo already declares
  // keeps its own config, even when the record names a different one.
  assert.deepEqual(await applyPackDeclarations(m, { read, write }), []);
  const other = M({ declarePacks: [{ id: 'NewPack', config: { repo: 'o/somewhere-else' } }] });
  assert.deepEqual(await applyPackDeclarations(other, { read, write }), []);
  assert.deepEqual(JSON.parse(repo.get('.claudinite-checks.json')).packs[1].config, { repo: 'o/store' });

  // A pack declared as a bare string, with no config, is the one entry still owed
  // something: it gets the config, in place, without losing its position.
  const bare = new Map([['.claudinite-checks.json', decl({ packs: ['basics', 'NewPack', 'tidy-repo'] })]]);
  assert.deepEqual(
    await applyPackDeclarations(m, { read: (p) => bare.get(p) ?? null, write: (p, c) => bare.set(p, c) }),
    ['.claudinite-checks.json: configured NewPack'],
  );
  assert.deepEqual(JSON.parse(bare.get('.claudinite-checks.json')).packs,
    ['basics', { id: 'NewPack', config: { repo: 'o/store' } }, 'tidy-repo']);

  // appliesTo:false skips, and a non-member / unparsable declaration is left alone
  // (the world runner owns that finding; a migration must not guess at a repair).
  const fresh = new Map([['.claudinite-checks.json', decl({ packs: [] })]]);
  const w2 = (p, c) => fresh.set(p, c);
  assert.deepEqual(await applyPackDeclarations(M({ appliesTo: async () => false, declarePacks: m.declarePacks }), { read: (p) => fresh.get(p) ?? null, write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => null, write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => '{oops', write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => '[]', write: w2 }), []);
  assert.equal(fresh.get('.claudinite-checks.json'), decl({ packs: [] }), 'nothing was written');
});

test('apply.mjs really performs the pack-declaration op — the wire, not just the function', () => {
  // The unit test above proves applyPackDeclarations; this proves the applier CALLS
  // it. A missing line in apply.mjs would leave every unit test green and every member
  // un-migrated, which is the exact failure mode a seed op is meant to prevent.
  const root = mkdtempSync(join(tmpdir(), 'claudinite-apply-'));
  try {
    writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify({ packs: ['basics'] }, null, 2)}\n`);
    const canon = dirname(dirname(fileURLToPath(import.meta.url)));
    const out = execFileSync(process.execPath, [join(canon, 'migrations/apply.mjs')], {
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.match(out, /declared UserPreferencesStore/);
    const after = JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'));
    assert.deepEqual(after.packs, ['basics', { id: 'UserPreferencesStore', config: { repo: 'missingbulb/Sheepdog' } }]);
    // …and running it again writes nothing at all.
    assert.equal(execFileSync(process.execPath, [join(canon, 'migrations/apply.mjs')], {
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    }), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('user-preferences-store migration: seeds the pack with the fleet\'s store, and tracks who still lacks it', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'user-preferences-store');
  assert.ok(m, 'user-preferences-store migration is discovered');
  assert.equal(m.retire, 'auto');
  // The one-time backfill: the pack every member should run, and the store none of
  // them can derive.
  assert.deepEqual(m.declarePacks, [{ id: 'UserPreferencesStore', config: { repo: 'missingbulb/Sheepdog' } }]);

  const read = (json) => async () => (json === null ? null : JSON.stringify(json));
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['basics'] })), true, 'pack undeclared -> legacy');
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['UserPreferencesStore'] })), false, 'declared -> done');
  assert.equal(await m.legacyPresent(() => false, read({ packs: [{ id: 'UserPreferencesStore', config: { repo: 'o/other' } }] })), false,
    'declared with a store of its own -> done, whatever it names');
  assert.equal(await m.legacyPresent(() => false, read(null)), false, 'no declaration -> not a member, not held');
  assert.equal(await m.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');
});

// Stated against the live corpus rather than a named record: the old form
// asserted migrationActive('chrome-release-vendoring'), which pinned the test to
// one migration happening to be un-retired. Archiving it — the TTL sweep's whole
// job — reds the suite for no defect. The contract is what matters, and it holds
// whichever records are live: a record in active_migrations is tolerated, one in
// migrations-old is not (its apply logic persists for backfill; its tolerance is
// what aging out ends).
const slugOf = (f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.mjs$/, '');

test('migrationActive: true for every live record, false once archived', () => {
  for (const f of specFiles()) {
    assert.equal(migrationActive(slugOf(f)), true, `active: ${f}`);
  }
  for (const f of oldSpecFiles()) {
    assert.equal(migrationActive(slugOf(f)), false, `archived: ${f}`);
  }
  assert.equal(migrationActive('no-such-migration-slug'), false);
});

// A workflow materialization can only be written by a caller that can get it delivered.
// Writing one into a tree an Action-token push is about to carry does not deliver a
// workflow — it rejects the whole ref and fails the converge with everything riding it.

test('applyMaterializations: a workflow dest is skipped unless the caller announced it can withhold', async () => {
  const m = M({ materialize: [
    { template: 'tpl/wf.yml', dest: '.github/workflows/fleet-baseline.yml' },
    { template: 'tpl/act.yml', dest: '.github/actions/thing/action.yml' },
  ] });
  const written = new Map();
  const io = (env) => ({
    readTemplate: async (p) => `content of ${p}`,
    read: async (p) => written.get(p) ?? null,
    write: async (p, c) => { written.set(p, c); },
    env,
  });

  // An incapable caller — an older vendored worker, a hand-run apply, CI.
  const skipped = await applyMaterializations(m, io({}));
  assert.deepEqual(skipped, [
    'SKIPPED .github/workflows/fleet-baseline.yml (workflow file; this caller cannot deliver one)',
    '.github/actions/thing/action.yml <- tpl/act.yml',
  ]);
  // The workflow was NOT written; the ordinary .github/ file was. Only workflow files are
  // special — an action, a template, a CODEOWNERS all push fine with the Action token.
  assert.equal(written.has('.github/workflows/fleet-baseline.yml'), false);
  assert.equal(written.get('.github/actions/thing/action.yml'), 'content of tpl/act.yml');
  // And it SAYS it skipped: a silent skip reads as "already current", and the file would
  // then never arrive at all.

  // The capable caller writes it, and the withhold path downstream keeps it out of the push.
  const applied = await applyMaterializations(m, io({ CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' }));
  assert.deepEqual(applied, ['.github/workflows/fleet-baseline.yml <- tpl/wf.yml']);
  assert.equal(written.get('.github/workflows/fleet-baseline.yml'), 'content of tpl/wf.yml');
});

test('callerCanDeliverWorkflows: only the exact announcement counts', () => {
  assert.equal(callerCanDeliverWorkflows({ CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' }), true);
  for (const env of [{}, { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '' }, { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: 'true' }, { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '0' }]) {
    assert.equal(callerCanDeliverWorkflows(env), false, JSON.stringify(env));
  }
  assert.equal(WITHHOLD_CAPABLE_ENV, 'CLAUDINITE_CAN_WITHHOLD_WORKFLOWS');
});

test('sheepdog-fleet-baseline migration: gated on declaring the pack, and on nothing else', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'sheepdog-fleet-baseline');
  assert.ok(m, 'discovered');
  const read = (decl) => async (p) => (p === '.claudinite-checks.json' ? decl : null);

  // Both declaration forms, since both are legal.
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: [{ id: 'sheepdog', config: {} }] }))), true);
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: ['sheepdog'] }))), true);
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: ['basics'] }))), false);
  assert.equal(await m.appliesTo(read('not json')), false);
  assert.equal(await m.appliesTo(read(null)), false);   // canon itself

  // Deliverability is NOT the record's question — the machinery owns it. A record-local
  // probe of the member's vendored worker was tried and was wrong: the vendor step earlier
  // in the same cycle has already replaced that file with the new version while the OLD
  // code is still executing, so the probe answers for the wrong worker.
  assert.equal(m.materialize.length, 1);
  assert.equal(m.materialize[0].dest, '.github/workflows/fleet-baseline.yml');
  assert.equal(await m.legacyPresent(() => false, async () => null), false);
  assert.equal(m.retire, 'manual');
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
  // Four of this record's nine materializations are WORKFLOW files, so the caller has to
  // be one that can deliver them — the same handshake baselining's worker makes. Run it
  // without the announcement and those four are skipped instead of wedging the push, which
  // is the hazard a workflow materialization carries for a caller that cannot push one.
  const capable = { [WITHHOLD_CAPABLE_ENV]: '1' };
  const incapable = await applyMaterializations(m, { readTemplate, read, write, env: {} });
  assert.equal(incapable.filter((l) => l.startsWith('SKIPPED')).length, 4);
  assert.equal(repo.size, 6, 'orchestrator + the 5 non-workflow files');

  await applyMaterializations(m, { readTemplate, read, write, env: capable });
  await applyRewrites(m, { read, write });
  assert.equal(repo.size, 10, 'orchestrator + 9 vendored files');
  assert.match(repo.get('.github/workflows/chrome-extension-release.yml'), /\.\/\.github\/workflows\/chrome-extension-create-package\.yml/);
  assert.ok(!repo.get('.github/workflows/chrome-extension-release.yml').includes('missingbulb/Claudinite'));
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

test('loadMigrations: the phase-3 retirements are really gone from the active set', async () => {
  // vendoring/DESIGN.md phase 3: the flip note, the mount-folder-relocation
  // chain, and the engine-restructure healer retired together once the fleet
  // converged — none may linger as a discoverable record.
  const ids = new Set((await loadMigrations()).map((m) => m.id));
  for (const retired of ['vendored-mount-flip', 'mount-folder-relocation', 'engine-restructure']) {
    assert.ok(!ids.has(retired), `${retired} must stay retired`);
  }
});
