import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadMigrations, resolvePath, applyFileAliases,
  applyMaterializations, applyRewrites, applyPackDeclarations, migrationActive,
  migrationAgentic, agenticMigrations,
  callerCanDeliverWorkflows, WITHHOLD_CAPABLE_ENV,
} from '../migrations/registry.mjs';
import { migrationDirs, recordDirIsRecent, RECENT_WINDOW_DAYS } from '../engine/checks/helpers/active-migrations.mjs';

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

// --- recordDirIsRecent (the one recency predicate: vendoring + tolerance) ----

test('recordDirIsRecent: within the window by folder-name date prefix, aged out at exactly the window', () => {
  assert.equal(RECENT_WINDOW_DAYS, 7);
  const today = '2026-07-15';
  assert.equal(recordDirIsRecent('2026-07-15-lands-today', today), true);
  assert.equal(recordDirIsRecent('2026-07-13-young', today), true);
  assert.equal(recordDirIsRecent('2026-07-09-edge-in', today), true);   // 6 days → still recent
  assert.equal(recordDirIsRecent('2026-07-08-edge-out', today), false); // exactly 7 days → aged out
  assert.equal(recordDirIsRecent('2026-07-01-old', today), false);
  assert.equal(recordDirIsRecent('not-a-dated-folder', today), false);  // unparsable prefix → never recent
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
    assert.match(out, /declared claude-code-web-users-support/);
    const after = JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'));
    assert.deepEqual(after.packs, ['basics', { id: 'claude-code-web-users-support', config: { repo: 'missingbulb/Sheepdog' } }]);
    // …and running it again writes nothing at all.
    assert.equal(execFileSync(process.execPath, [join(canon, 'migrations/apply.mjs')], {
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    }), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('claude-code-web-users-support migration: seeds the pack with the fleet\'s store, and tracks who still lacks it', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'claude-code-web-users-support');
  assert.ok(m, 'claude-code-web-users-support migration is discovered');
  // The one-time backfill: the pack every member should run, and the store none of
  // them can derive.
  assert.deepEqual(m.declarePacks, [{ id: 'claude-code-web-users-support', config: { repo: 'missingbulb/Sheepdog' } }]);

  const read = (json) => async () => (json === null ? null : JSON.stringify(json));
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['basics'] })), true, 'pack undeclared -> legacy');
  assert.equal(await m.legacyPresent(() => false, read({ packs: ['claude-code-web-users-support'] })), false, 'declared -> done');
  assert.equal(await m.legacyPresent(() => false, read({ packs: [{ id: 'claude-code-web-users-support', config: { repo: 'o/other' } }] })), false,
    'declared with a store of its own -> done, whatever it names');
  assert.equal(await m.legacyPresent(() => false, read(null)), false, 'no declaration -> not a member, not held');
  assert.equal(await m.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');
});

// Stated against the live corpus rather than a named record, with `today` pinned
// per record: asserting a named record's tolerance against the wall clock would
// red the suite the day it ages out of the window, for no defect. The contract is
// what matters, and it holds for every record: tolerated while its landed date is
// within the window, not after — its apply logic persists for backfill (a dormant
// project applies from the fresh canon clone); the tolerance is what aging ends.
const slugOf = (d) => d.replace(/^\d{4}-\d{2}-\d{2}-/, '');

test('migrationActive: true for every record within the window, false once aged out', () => {
  const dirs = migrationDirs();
  assert.ok(dirs.length > 0, 'the live corpus has records');
  for (const d of dirs) {
    const landed = d.slice(0, 10);
    assert.equal(migrationActive(slugOf(d), landed), true, `recent: ${d}`);
    const aged = new Date(new Date(`${landed}T00:00:00Z`).getTime() + RECENT_WINDOW_DAYS * 86400000)
      .toISOString().slice(0, 10);
    assert.equal(migrationActive(slugOf(d), aged), false, `aged out: ${d}`);
  }
  assert.equal(migrationActive('no-such-migration-slug'), false);
});

test('every record folder is <landed>-<slug>/migration.mjs, prefix matching its landed date', async () => {
  const migs = await loadMigrations();
  assert.equal(migs.length, migrationDirs().length);
  for (const m of migs) {
    assert.match(m.dir, /^\d{4}-\d{2}-\d{2}-/, `dated folder: ${m.dir}`);
    assert.equal(m.dir.slice(0, 10), m.landed, `folder prefix = landed for ${m.id} — vendoring and tolerance window off the prefix`);
  }
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
});

test('chrome-release-vendoring migration: gate, telemetry, and the vendoring round-trip', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'chrome-release-vendoring');
  assert.ok(m, 'discovered');
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
  const read = (packs) => async () => JSON.stringify({ packs });
  assert.equal(await seed.legacyPresent(() => false, read(['basics'])), true, 'lacks tidy-repo -> legacy');
  assert.equal(await seed.legacyPresent(() => false, read(['basics', 'tidy-repo'])), false, 'has it -> done');
  assert.equal(await seed.legacyPresent(() => false, async () => null), false, 'no declaration -> not held');
  assert.equal(await seed.legacyPresent(() => false, async () => 'nope'), false, 'unparsable -> not held');
});

test('local-pack-namespace migration: legacyPresent = a bare declared id whose pack lives in the member\'s local_packs', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'local-pack-namespace');
  assert.ok(m, 'local-pack-namespace migration is discovered');
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
