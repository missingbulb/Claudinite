import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../engine/remove-tree.mjs';
import { isDeclaredVersion, versionAbove } from '../engine/version.mjs';
import {
  loadMigrations, resolvePath, applyFileAliases,
  applyMaterializations, applyRewrites, applyPackDeclarations, migrationActive,
  applyLocalDeclarationNormalization, applyMigration,
  assertNoAgenticNote, assertApplyStageDeclaration,
  callerCanDeliverWorkflows, WITHHOLD_CAPABLE_ENV,
} from '../engine/migrations/registry.mjs';
import {
  migrationDirs, migrationRoots, recordName, recordDirIsRecent, RECENT_WINDOW_DAYS,
  recordVersion, flowOf, installedFor, installedVersions, migrationApplies,
} from '../engine/checks/helpers/active-migrations.mjs';

const M = (over = {}) => ({ id: 'm', landed: '2026-01-01', aliases: [], ...over });

test('the retired agentic field is REJECTED, not ignored (#768 Phase 5)', () => {
  // Ignoring it would be the worse failure: someone writes a note in good faith and
  // the work silently never happens, which is the exact correctness risk the note was
  // invented to close (#405). So a record carrying one fails, with the fix attached.
  assert.equal(assertNoAgenticNote(M()), undefined, 'a record without one is simply fine');
  assert.equal(assertNoAgenticNote(M({ agentic: null })), undefined);
  for (const shape of [{ model: 'sonnet', instructions: 'x' }, 'sonnet', {}]) {
    assert.throws(() => assertNoAgenticNote(M({ agentic: shape })), /retired in #768 Phase 5/,
      `a note shaped ${JSON.stringify(shape)} must not slip through`);
  }
  // The error has to say where the work goes now, or it is just a wall.
  assert.throws(() => assertNoAgenticNote(M({ agentic: { model: 'sonnet', instructions: 'x' } })), /applyStage/);
});

test('a pack record may ask for the apply stage; an engine record may not (#798)', () => {
  const pack = (over) => ({ ...M(over), dir: 'packs/basics/migrations/2026-08-13-x' });
  const engine = (over) => ({ ...M(over), dir: 'engine/migrations/2026-08-13-x' });

  assert.equal(assertApplyStageDeclaration(pack()), undefined, 'declaring nothing is the common case');
  assert.equal(assertApplyStageDeclaration(pack({ applyStage: { why: 'rules met member content' } })), undefined);
  assert.equal(assertApplyStageDeclaration(pack({ applyStage: { why: 'w', instructions: 'Do the thing.' } })), undefined);

  // "No agentic work in the engine flow. Ever." (DESIGN §5) — and the flow is read off
  // where the record LIVES, so a record cannot declare its way into a lane whose flow
  // has no session to dispatch. Without this the field would be accepted and then
  // silently never acted on, which is the failure the retired note was killed for.
  assert.throws(() => assertApplyStageDeclaration(engine({ applyStage: { why: 'w' } })),
    /only a PACK record/, 'the engine update flow has no agentic lane to put this in');

  // A bare flag is refused: the terminal vocabulary requires every non-green end to
  // be explainable, and `applyStage: true` explains nothing.
  for (const shape of [true, 'yes', ['w'], {}, { why: '' }, { why: '   ' }, { why: 42 }]) {
    assert.throws(() => assertApplyStageDeclaration(pack({ applyStage: shape })),
      /applyStage/, `a stage declared as ${JSON.stringify(shape)} must not load`);
  }
  assert.throws(() => assertApplyStageDeclaration(pack({ applyStage: { why: 'w', instructions: ['a'] } })),
    /instructions" must be a string/);
});

test('the shape check runs at LOAD, so the live corpus is covered by it', async () => {
  // The selection half again: a validator nothing calls is a validator that is wrong
  // about the corpus for as long as nobody looks.
  const migs = await loadMigrations();
  for (const m of migs) {
    assert.equal(assertApplyStageDeclaration(m), undefined, `${m.dir} would not load`);
    if (m.applyStage) assert.equal(flowOf(m.dir).flow, 'pack', `${m.dir} asks for a session its flow cannot dispatch`);
  }
});

test('no record in the live corpus carries the retired field', async () => {
  // The selection half: the throw only bites on records that go through it, and
  // loadMigrations is what every real caller uses — so this is also the assertion
  // that loading the real tree does not throw.
  const migs = await loadMigrations();
  assert.ok(migs.length > 0, 'the corpus still has records to load');
  for (const m of migs) assert.equal(m.agentic, undefined, `${m.dir} still carries an agentic note`);
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
  const repo = new Map([['.claudinite-settings.json', decl({ packs: ['basics'], maintenance: { delivery: 'auto-merge' } })]]);
  const read = (p) => repo.get(p) ?? null;
  const write = (p, c) => repo.set(p, c);
  const m = M({ declarePacks: [{ id: 'NewPack', config: { repo: 'o/store' } }] });

  assert.deepEqual(await applyPackDeclarations(m, { read, write }), ['.claudinite-settings.json: declared NewPack']);
  const after = JSON.parse(repo.get('.claudinite-settings.json'));
  assert.deepEqual(after.packs, ['basics', { id: 'NewPack', config: { repo: 'o/store' } }]);
  assert.deepEqual(after.maintenance, { delivery: 'auto-merge' }, 'the rest of the declaration survives');
  assert.equal(repo.get('.claudinite-settings.json'), decl(after), 'canonical 2-space settings with a trailing newline');

  // Idempotent, and — the contract that matters — a pack the repo already declares
  // keeps its own config, even when the record names a different one.
  assert.deepEqual(await applyPackDeclarations(m, { read, write }), []);
  const other = M({ declarePacks: [{ id: 'NewPack', config: { repo: 'o/somewhere-else' } }] });
  assert.deepEqual(await applyPackDeclarations(other, { read, write }), []);
  assert.deepEqual(JSON.parse(repo.get('.claudinite-settings.json')).packs[1].config, { repo: 'o/store' });

  // A pack declared as a bare string, with no config, is the one entry still owed
  // something: it gets the config, in place, without losing its position.
  const bare = new Map([['.claudinite-settings.json', decl({ packs: ['basics', 'NewPack', 'tidy-repo'] })]]);
  assert.deepEqual(
    await applyPackDeclarations(m, { read: (p) => bare.get(p) ?? null, write: (p, c) => bare.set(p, c) }),
    ['.claudinite-settings.json: configured NewPack'],
  );
  assert.deepEqual(JSON.parse(bare.get('.claudinite-settings.json')).packs,
    ['basics', { id: 'NewPack', config: { repo: 'o/store' } }, 'tidy-repo']);

  // appliesTo:false skips, and a non-member / unparsable declaration is left alone
  // (the world runner owns that finding; a migration must not guess at a repair).
  const fresh = new Map([['.claudinite-settings.json', decl({ packs: [] })]]);
  const w2 = (p, c) => fresh.set(p, c);
  assert.deepEqual(await applyPackDeclarations(M({ appliesTo: async () => false, declarePacks: m.declarePacks }), { read: (p) => fresh.get(p) ?? null, write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => null, write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => '{oops', write: w2 }), []);
  assert.deepEqual(await applyPackDeclarations(m, { read: () => '[]', write: w2 }), []);
  assert.equal(fresh.get('.claudinite-settings.json'), decl({ packs: [] }), 'nothing was written');
});

test('apply.mjs really performs the pack-declaration op — the wire, not just the function', () => {
  // The unit test above proves applyPackDeclarations; this proves the applier CALLS
  // it. A missing line in apply.mjs would leave every unit test green and every member
  // un-migrated, which is the exact failure mode a seed op is meant to prevent.
  const root = mkdtempSync(join(tmpdir(), 'claudinite-apply-'));
  try {
    writeFileSync(join(root, '.claudinite-settings.json'), `${JSON.stringify({ packs: ['basics'] }, null, 2)}\n`);
    const canon = dirname(dirname(fileURLToPath(import.meta.url)));
    const out = execFileSync(process.execPath, [join(canon, 'engine/migrations/apply.mjs')], {
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.match(out, /declared claude-code-web-users-support/);
    assert.match(out, /declared claudinite-lifecycle/);
    const after = JSON.parse(readFileSync(join(root, '.claudinite-settings.json'), 'utf8'));
    // Every seed record the corpus carries, applied in record order onto the
    // declaration the fixture started from.
    assert.deepEqual(after.packs, [
      'basics',
      { id: 'claude-code-web-users-support', config: { repo: 'missingbulb/Shepherd' } },
      'claudinite-lifecycle',
    ]);
    // …and running it again writes nothing at all.
    assert.equal(execFileSync(process.execPath, [join(canon, 'engine/migrations/apply.mjs')], {
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    }), '');
  } finally { removeTree(root); }
});

test('claude-code-web-users-support migration: seeds the pack with the fleet\'s store, and tracks who still lacks it', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'claude-code-web-users-support');
  assert.ok(m, 'claude-code-web-users-support migration is discovered');
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
const slugOf = (d) => recordName(d).replace(/^\d{4}-\d{2}-\d{2}-/, '');

test('migrationActive: true for every record within the window, false once aged out', () => {
  const dirs = migrationDirs();
  assert.ok(dirs.length > 0, 'the live corpus has records');
  for (const d of dirs) {
    const landed = recordName(d).slice(0, 10);
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
    assert.match(recordName(m.dir), /^\d{4}-\d{2}-\d{2}-/, `dated folder: ${m.dir}`);
    assert.equal(recordName(m.dir).slice(0, 10), m.landed, `folder prefix = landed for ${m.id} — vendoring and tolerance window off the prefix`);
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
});

test('sheepdog-fleet-baseline migration: gated on declaring the pack, and on nothing else', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'sheepdog-fleet-baseline');
  assert.ok(m, 'discovered');
  const read = (decl) => async (p) => (p === '.claudinite-settings.json' ? decl : null);

  // Both declaration forms, since both are legal.
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: [{ id: 'claudinite-fleet-sheepdog', config: {} }] }))), true);
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: ['claudinite-fleet-sheepdog'] }))), true);
  // And under the spelling an enforcer's declaration carried when the record landed.
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: ['sheepdog'] }))), true);
  assert.equal(await m.appliesTo(read(JSON.stringify({ packs: ['basics'] }))), false);
  assert.equal(await m.appliesTo(read('not json')), false);
  assert.equal(await m.appliesTo(read(null)), false);   // canon itself

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
  // Five of this record's ten materializations are WORKFLOW files, so the caller has to
  // be one that can deliver them — the same handshake baselining's worker makes. Run it
  // without the announcement and those five are skipped instead of wedging the push, which
  // is the hazard a workflow materialization carries for a caller that cannot push one.
  const capable = { [WITHHOLD_CAPABLE_ENV]: '1' };
  const incapable = await applyMaterializations(m, { readTemplate, read, write, env: {} });
  assert.equal(incapable.filter((l) => l.startsWith('SKIPPED')).length, 5);
  assert.equal(repo.size, 6, 'orchestrator + the 5 non-workflow files');

  await applyMaterializations(m, { readTemplate, read, write, env: capable });
  // The rewrite needs the announcement for the same reason the materializations do: its
  // target IS a workflow file. Passing it only to the materializations is the blind spot
  // #1509 closed — an unguarded rewrite reported this orchestrator rewritten in every
  // real (incapable) update run, while the caller's `write` dropped it.
  await applyRewrites(m, { read, write, env: capable });
  assert.equal(repo.size, 11, 'orchestrator + 10 vendored files');
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

test('every record lives under the flow that owns it — the engine, or one pack', () => {
  // The engine/pack split (DESIGN §3.7): a record's home is what says which flow
  // fetches, version-ranges and applies it, so a record in neither home belongs to
  // no flow and would simply stop being delivered once the flat directory is gone.
  const roots = migrationRoots();
  assert.ok(roots.includes('engine/migrations'), 'the engine root is always a home, records or not');
  for (const d of migrationDirs()) {
    const home = dirname(d);
    assert.ok(roots.includes(home), `${d} sits in "${home}", which is no flow's migrations home`);
    assert.match(home, /^(engine|packs\/[^/]+)\/migrations$/, `${d} is not under an engine or pack home`);
  }
});

// --- the version gate (#768 Phase 1) ------------------------------------------

test('flowOf reads the owning flow off the path — no record declares which it is', () => {
  assert.deepEqual(flowOf('engine/migrations/2026-08-06-x'), { flow: 'engine' });
  assert.deepEqual(flowOf('packs/claudinite-fleet-sheepdog/migrations/2026-08-11-y'), { flow: 'pack', pack: 'claudinite-fleet-sheepdog' });
});

test('installedFor keeps "the stamp says nothing" distinct from a real number', () => {
  const stamp = { engineVersion: 3, packVersions: { 'claudinite-fleet-sheepdog': 2, tidy: 0 } };
  assert.equal(installedFor('engine/migrations/2026-01-01-a', stamp), 3);
  assert.equal(installedFor('packs/claudinite-fleet-sheepdog/migrations/2026-01-01-a', stamp), 2);
  assert.equal(installedFor('packs/tidy/migrations/2026-01-01-a', stamp), 0, 'a real zero is a version, not an absence');
  assert.equal(installedFor('packs/never-heard-of/migrations/2026-01-01-a', stamp), undefined);
  assert.equal(installedFor('engine/migrations/2026-01-01-a', null), undefined);
  assert.equal(installedFor('engine/migrations/2026-01-01-a', { packVersions: {} }), undefined);
});

test('installedVersions returns null for every shape that is not a version stamp', () => {
  assert.equal(installedVersions(() => null), null);
  assert.equal(installedVersions(() => 'not json'), null);
  assert.equal(installedVersions(() => '{"packs":[]}'), null);
  assert.equal(installedVersions(() => '{"claudinite":{"updated":"2026-01-01T00:00:00Z"}}'), null,
    'a pre-version stamp is unknown, not zero');
  assert.deepEqual(installedVersions(() => '{"claudinite":{"engineVersion":2}}'), { engineVersion: 2, packVersions: {} });
});

test('migrationApplies: version-ranged when known, date-windowed when not', () => {
  // Driven over the live records, so the predicate is exercised against real paths
  // and real declared versions rather than a shape a fixture invented.
  const dir = migrationDirs().find((d) => flowOf(d).flow === 'engine');
  const at = recordVersion(dir);
  const landed = recordName(dir).slice(0, 10);

  // Known both sides: applies strictly below the version its change took effect at.
  assert.equal(migrationApplies(dir, { installed: { engineVersion: at - 1 } }), true, 'a lagging repo still needs it');
  assert.equal(migrationApplies(dir, { installed: { engineVersion: at } }), false, 'an up-to-date repo does not');
  assert.equal(migrationApplies(dir, { installed: { engineVersion: at + 1 } }), false);
  // …and the date is irrelevant once versions answer: an ancient record still
  // applies to a repo below it, which is exactly what the window could never say.
  assert.equal(migrationApplies(dir, { installed: { engineVersion: at - 1 }, today: '2099-01-01' }), true);

  // Unknown: the window, unchanged — the behaviour every member had before this.
  assert.equal(migrationApplies(dir, { installed: null, today: landed }), true);
  assert.equal(migrationApplies(dir, { installed: null, today: '2099-01-01' }), false);
});

test('every record declares a version, and the regex reads what the module exports', async () => {
  // Two readings of one fact: `recordVersion` regexes the source because every
  // caller is synchronous, while the applier imports the spec. A record whose
  // literal the regex cannot see would silently fall back to the date window —
  // invisible, and wrong the moment versions are what gate fetching. So the guard
  // EXECUTES both readings over every real record rather than trusting either.
  const migs = await loadMigrations();
  assert.ok(migs.length > 0, 'the live corpus has records');
  for (const m of migs) {
    assert.ok(isDeclaredVersion(m.version),
      `${m.dir} declares no version — a record needs the version its change takes effect at`);
    assert.equal(recordVersion(m.dir), m.version,
      `${m.dir}: the version read from the source disagrees with the module's — keep the field a plain literal on its own line`);
  }
});

// --- regex rewrites and the local-declaration codemod (#768 Phase 1) ----------

const io = (files, exists = () => false) => {
  const written = { ...files };
  return {
    written,
    read: (p) => written[p] ?? null,
    write: (p, c) => { written[p] = c; },
    exists: (p) => exists(p),
    move: () => {},
    readTemplate: () => null,
  };
};

test('applyRewrites: a global pattern rewrites every match; a non-global one is refused', async () => {
  const m = M({ rewrite: [{ file: 'f.txt', replace: [{ pattern: /v(\d)/g, to: 'V$1' }] }] });
  const w = io({ 'f.txt': 'v1 and v2\n' });
  assert.deepEqual(await applyRewrites(m, w), ['f.txt']);
  assert.equal(w.written['f.txt'], 'V1 and V2\n');
  // Idempotent: nothing matches the second time.
  assert.deepEqual(await applyRewrites(m, w), []);

  // A non-global pattern would rewrite the first match and leave a file that reads
  // as migrated — loud, not silent.
  const bad = M({ rewrite: [{ file: 'f.txt', replace: [{ pattern: /v(\d)/, to: 'V$1' }] }] });
  await assert.rejects(() => applyRewrites(bad, io({ 'f.txt': 'v1 v2' })), /must be a global RegExp/);
  await assert.rejects(() => applyRewrites(M({ rewrite: [{ file: 'f.txt', replace: [{ pattern: 'v1', to: 'V1' }] }] }), io({ 'f.txt': 'v1' })), /global RegExp/);
});

test('local declarations normalize to local/<id>, from both earlier forms', async () => {
  const decl = {
    packs: ['basics', 'mine', 'local_packs/older', { id: 'configured', config: { k: 1 } }, 'local/already'],
  };
  const local = new Set(['.claudinite/local/packs/mine/pack.mjs', '.claudinite/local_packs/configured/pack.mjs']);
  const w = io({ '.claudinite-settings.json': `${JSON.stringify(decl, null, 2)}\n` }, (p) => local.has(p));
  const done = await applyLocalDeclarationNormalization(M({ normalizeLocalDeclarations: true }), w);

  const after = JSON.parse(w.written['.claudinite-settings.json']);
  assert.deepEqual(after.packs, [
    'basics',                                     // a canon id: untouched, though bare
    'local/mine',                                 // bare, and this repo has the pack
    'local/older',                                // the earlier namespaced form
    { id: 'local/configured', config: { k: 1 } }, // an entry object keeps everything else
    'local/already',                              // already canonical
  ]);
  assert.equal(done.length, 3);
  // Idempotent — the second pass finds nothing to do and writes nothing.
  const again = { ...w, written: { ...w.written } };
  assert.deepEqual(await applyLocalDeclarationNormalization(M({ normalizeLocalDeclarations: true }), { ...again, read: (p) => again.written[p] ?? null, write: (p, c) => { again.written[p] = c; }, exists: (p) => local.has(p) }), []);
});

test('a record without the flag normalizes nothing', async () => {
  const w = io({ '.claudinite-settings.json': '{"packs":["mine"]}\n' }, () => true);
  assert.deepEqual(await applyLocalDeclarationNormalization(M(), w), []);
  assert.equal(w.written['.claudinite-settings.json'], '{"packs":["mine"]}\n');
});

test('applyMigration runs every op — the vocabulary has one runner, not one per caller', async () => {
  // The omission this guards is silent: an op wired into one applier and not the
  // other leaves records that simply do nothing on that path. Asserted by running a
  // record that carries EVERY op through the single entry point.
  const m = M({
    rewrite: [{ file: 'f.txt', replace: [{ from: 'old', to: 'new' }] }],
    declarePacks: [{ id: 'added' }],
    normalizeLocalDeclarations: true,
  });
  // `exists` answers only for the repo's real local pack — a blanket true would make
  // every id look local, including one this record's own declarePacks just added.
  const w = io({ 'f.txt': 'old\n', '.claudinite-settings.json': '{"packs":["mine"]}\n' },
    (p) => p === '.claudinite/local/packs/mine/pack.mjs');
  const applied = await applyMigration(m, w);
  assert.equal(w.written['f.txt'], 'new\n', 'rewrite ran');
  const after = JSON.parse(w.written['.claudinite-settings.json']);
  assert.deepEqual(after.packs, ['local/mine', 'added'], 'normalization and declaration both ran');
  assert.ok(applied.length >= 3, applied.join(' | '));
});

// --- the 2026-08-19 pack renames -------------------------------------------
// This record owns the MOUNT half only. Its declaration rewrite was textual, could
// not cross a nested array in an entry object, and converged nothing in the field;
// the structural replacement lives in the -declaration record (#1041), and is
// asserted below against a real member declaration.
test('pack-renames: leaves the declaration alone — that half is a record of its own', async () => {
  const rec = (await import('../engine/migrations/2026-08-19-pack-renames/migration.mjs')).default;
  const before = '{\n  "packs": [\n    "core",\n    { "id": "grow_with_claudinite", "via": ["basics"] }\n  ]\n}\n';
  const w = io({ '.claudinite-settings.json': before });
  await applyMigration(rec, w);
  assert.equal(w.written['.claudinite-settings.json'], before,
    'a textual rewrite of the declaration is what #1041 removed — the structural op in the sibling record replaces it');
});

test('pack-renames: the mount directories move, and only from the old path', async () => {
  const rec = (await import('../engine/migrations/2026-08-19-pack-renames/migration.mjs')).default;
  const present = new Set(['.claudinite/shared/packs/core', '.claudinite/shared/packs/grow_with_claudinite', '.claudinite/shared/packs/basics']);
  const move = (from, to) => { present.delete(from); present.add(to); };
  const done = await applyFileAliases(rec, { exists: (p) => present.has(p), move });
  assert.deepEqual(done.sort(), [
    '.claudinite/shared/packs/core -> .claudinite/shared/packs/claudinite-lifecycle',
    '.claudinite/shared/packs/grow_with_claudinite -> .claudinite/shared/packs/claudinite-growth',
  ]);
  assert.deepEqual([...present].sort(), [
    '.claudinite/shared/packs/basics', '.claudinite/shared/packs/claudinite-growth', '.claudinite/shared/packs/claudinite-lifecycle',
  ]);
  // A converged mount has nothing left to move.
  assert.deepEqual(await applyFileAliases(rec, { exists: (p) => present.has(p), move }), []);
});

// --- the declaration half of the pack renames (#1041) -----------------------
// The fixture is a REAL member declaration, captured off the canary before it
// converged, and it is real on purpose. The regex this op replaced passed a
// synthetic fixture and converged nothing in the field: the synthetic one had an
// entry object with a plain config, the real one has entry objects with nested
// `via` arrays, and the nesting was the whole bug. A fixture written from the same
// understanding as the code can only ever agree with it.
const REAL_DECLARATION = new URL('./fixtures/member-declaration-pre-rename.json', import.meta.url);

test('applyPackRenames: converges a real member declaration, entry objects and all', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../engine/migrations/2026-08-19-pack-renames-declaration/migration.mjs')).default;
  const before = readFileSync(REAL_DECLARATION, 'utf8');
  let written = null;
  const done = await applyPackRenames(rec, {
    read: async (f) => (f === '.claudinite-settings.json' ? before : null),
    write: async (_f, c) => { written = c; },
  });
  assert.equal(done.length, 5, `expected every rename this map carries, got ${JSON.stringify(done)}`);
  const after = JSON.parse(written);
  // `barriers` was absorbed into `basics`, which this declaration already carries,
  // so its entry merges into that one — and the `via: ['basics']` it was pulled in
  // by names the survivor itself, so it goes rather than leaving basics required by
  // basics. What remains is the bare string a plainly-declared pack has.
  assert.deepEqual(after.packs, [
    'basics',
    { id: 'git-github', via: ['basics'] },
    'claudinite-growth',
    'tidy-repo',
    'local/canary',
    { id: 'claude-code-web-users-support', config: { repo: 'missingbulb/Shepherd' } },
    'claudinite-canary-repo',
    'claudinite-lifecycle',
  ], 'ids move; config, via and order do not');
});

test('applyPackRenames: idempotent, and blind to everything outside the packs array', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../engine/migrations/2026-08-19-pack-renames-declaration/migration.mjs')).default;
  const run = async (text) => {
    let written = null;
    const done = await applyPackRenames(rec, {
      read: async () => text, write: async (_f, c) => { written = c; },
    });
    return { done, written };
  };
  // A member whose own source tree has a core/ directory under a barrier rule, and
  // a local pack that happens to share a renamed pack's old name.
  const declaration = JSON.stringify({
    packs: ['core', 'local/core'],
    config: { rules: [{ from: 'core', to: 'ui/*' }] },
  }, null, 2);
  const first = await run(declaration);
  const parsed = JSON.parse(first.written);
  assert.deepEqual(parsed.packs, ['claudinite-lifecycle', 'local/core']);
  assert.equal(parsed.config.rules[0].from, 'core', "a member's own core/ directory is untouched");

  const second = await run(first.written);
  assert.deepEqual(second.done, [], 'a converged declaration is a no-op');
  assert.equal(second.written, null, 'and is not rewritten at all');
});

// --- an ABSORBED pack: two declared ids that become one (#1057) --------------
// The chrome-extension-release collapse is the first rename whose target is a pack
// the member ALREADY declares — chrome-extension was the absorbed pack's `requires`,
// so every member carrying one carried both. The op therefore has to merge, and what
// it merges is the member's own writing: the config it answered at adoption, the
// severities it chose, the acceptances standing against findings that would
// otherwise come straight back.
// The absorption the plain merge gets WRONG on its own. Two flat `config` objects
// spread over each other, so the absorbed pack's parameters land under the
// survivor's own key namespace — and an answer recorded against a question the
// absorbed pack declared outlives that question. `absorbedPackConfig` is the record
// saying which of its renames is an absorption, and what to do about both.
test('absorbedPackConfig: the absorbed config nests under its own id and its stale answers go', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../packs/claudinite-lifecycle/migrations/2026-09-04-barriers-absorbed/migration.mjs')).default;
  const declaration = JSON.stringify({
    packs: [
      'claudinite-lifecycle',
      'basics',
      { id: 'barriers', config: { rules: [{ from: 'engine', to: 'packs/*' }] }, answers: { goals: 'keep core generic' } },
    ],
  }, null, 2);
  // The record probes the mounted registry for its op before doing anything, so the
  // io has to answer that read as a capable mount does.
  const read = async (f) => (f.endsWith('migrations/registry.mjs') ? 'absorbedPackConfig' : declaration);
  let written = null;
  const done = await applyPackRenames(rec, { read, write: async (_f, c) => { written = c; } });
  assert.equal(done.length, 2, `expected the rename and the merge, got ${JSON.stringify(done)}`);
  assert.deepEqual(JSON.parse(written).packs, [
    'claudinite-lifecycle',
    { id: 'basics', config: { barriers: { rules: [{ from: 'engine', to: 'packs/*' }] } } },
  ], 'the graph reaches the key the absorbed check reads, and the answer to the retired question is gone');
});

// An answer the record does NOT name is a live answer to a question the surviving
// pack still asks — dropping every answer would lose it.
test('absorbedPackConfig: only the named answers are dropped', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../packs/claudinite-lifecycle/migrations/2026-09-04-barriers-absorbed/migration.mjs')).default;
  let written = null;
  await applyPackRenames(rec, {
    read: async (f) => (f.endsWith('migrations/registry.mjs') ? 'absorbedPackConfig'
      : JSON.stringify({ packs: [{ id: 'barriers', answers: { goals: 'gone', keep: 'stays' } }] })),
    write: async (_f, c) => { written = c; },
  });
  assert.deepEqual(JSON.parse(written).packs, [{ id: 'basics', answers: { keep: 'stays' } }]);
});

// The record is inert until the member's own mount carries the op, so a stale
// engine cannot half-apply it — rename the id and leave the graph flat, where the
// absorbed check does not look.
test('the barriers-absorbed record stands down on a mount whose engine lacks the op', async () => {
  const rec = (await import('../packs/claudinite-lifecycle/migrations/2026-09-04-barriers-absorbed/migration.mjs')).default;
  assert.equal(await rec.appliesTo(async () => 'export function applyPackRenames() {}\n'), false);
  assert.equal(await rec.appliesTo(async () => null), false);
  assert.equal(await rec.appliesTo(async (f) => (f.startsWith('.claudinite/shared/') ? 'absorbedPackConfig' : null)), true);
});

test('applyPackRenames: an absorbed pack merges into the entry that already exists', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../packs/chrome-extension/migrations/2026-08-19-chrome-release-collapse/migration.mjs')).default;
  const declaration = JSON.stringify({
    packs: [
      'basics',
      { id: 'chrome-extension', accept: [{ rule: 'ce/content-script-module-syntax', path: 'src/', reason: 'bundled' }] },
      { id: 'chrome-extension-release', config: { store_id: 'abc' }, accept: [{ rule: 'cer/readme-sections', path: 'README.md', reason: 'template lands later' }] },
    ],
  }, null, 2);
  let written = null;
  const done = await applyPackRenames(rec, {
    read: async () => declaration, write: async (_f, c) => { written = c; },
  });
  assert.equal(done.length, 2, `expected the rename and the merge, got ${JSON.stringify(done)}`);
  const packs = JSON.parse(written).packs;
  assert.deepEqual(packs, [
    'basics',
    {
      id: 'chrome-extension',
      accept: [
        { rule: 'ce/content-script-module-syntax', path: 'src/', reason: 'bundled' },
        { rule: 'cer/readme-sections', path: 'README.md', reason: 'template lands later' },
      ],
      config: { store_id: 'abc' },
    },
  ], 'one entry, in the surviving id\'s original position, carrying both sides');

  const again = await applyPackRenames(rec, {
    read: async () => written, write: async () => { assert.fail('nothing left to write'); },
  });
  assert.deepEqual(again, [], 'a converged declaration is a no-op');
});

test('applyPackRenames: a string entry absorbing an object keeps the object side', async () => {
  const { applyPackRenames } = await import('../engine/migrations/registry.mjs');
  const rec = (await import('../packs/chrome-extension/migrations/2026-08-19-chrome-release-collapse/migration.mjs')).default;
  let written = null;
  await applyPackRenames(rec, {
    read: async () => JSON.stringify({
      packs: ['chrome-extension', { id: 'chrome-extension-release', config: { store_id: 'abc' } }],
    }, null, 2),
    write: async (_f, c) => { written = c; },
  });
  assert.deepEqual(JSON.parse(written).packs, [{ id: 'chrome-extension', config: { store_id: 'abc' } }],
    'the survivor is promoted to an object rather than dropping the absorbed config');
});

test('mergeDeclarationEntries: the survivor wins a conflict, arrays union', async () => {
  const { mergeDeclarationEntries } = await import('../engine/migrations/registry.mjs');
  assert.deepEqual(
    mergeDeclarationEntries(
      { id: 'p', config: { a: 1, keep: 'survivor' }, via: ['basics'] },
      { id: 'q', config: { b: 2, keep: 'absorbed' }, via: ['basics', 'other'] },
    ),
    { id: 'p', config: { a: 1, keep: 'survivor', b: 2 }, via: ['basics', 'other'] },
  );
  assert.deepEqual(mergeDeclarationEntries({ id: 'p', config: { a: 1 } }, 'q'), { id: 'p', config: { a: 1 } },
    'a plain-string entry carries an id and nothing else, so there is nothing to take from it');
});

// THE FALSE GREEN (#1509). `applyMaterializations` has guarded workflow dests since
// #649; `applyRewrites` never did, and the two are the same surface — a record naming a
// path under `.github/workflows/`. Because the update flow's `write` silently drops such
// a path, an unguarded rewrite reported the file in `done` while writing nothing: a run
// that delivered no workflow said it had. Nothing hit it while no record rewrote a
// workflow, and #1509 makes that the shape the executor's own line arrives in.
test('applyRewrites: a workflow file is SKIPPED and SAID, never falsely reported written', async () => {
  const m = {
    id: 'r',
    rewrite: [
      { file: '.github/workflows/claudinite-executor.yml', replace: [{ from: 'OLD', to: 'NEW' }] },
      { file: '.claudinite/shared/thing.mjs', replace: [{ from: 'OLD', to: 'NEW' }] },
    ],
  };
  const files = new Map([
    ['.github/workflows/claudinite-executor.yml', 'a OLD b'],
    ['.claudinite/shared/thing.mjs', 'a OLD b'],
  ]);
  const io = (env) => ({
    read: async (p) => files.get(p) ?? null,
    write: async (p, c) => { files.set(p, c); },
    env,
  });

  const skipped = await applyRewrites(m, io({}));
  assert.deepEqual(skipped, [
    'SKIPPED .github/workflows/claudinite-executor.yml (workflow file; this caller cannot deliver one)',
    '.claudinite/shared/thing.mjs',
  ]);
  assert.equal(files.get('.github/workflows/claudinite-executor.yml'), 'a OLD b',
    'the workflow is untouched, not half-rewritten');
  assert.equal(files.get('.claudinite/shared/thing.mjs'), 'a NEW b');

  // The capable caller rewrites it; the withhold path downstream keeps it out of the push.
  files.set('.claudinite/shared/thing.mjs', 'a OLD b');
  const applied = await applyRewrites(m, io({ CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' }));
  assert.deepEqual(applied, ['.github/workflows/claudinite-executor.yml', '.claudinite/shared/thing.mjs']);
  assert.equal(files.get('.github/workflows/claudinite-executor.yml'), 'a NEW b');
});


// The record that carries #1494's line to members that adopted before it (#1518). What
// matters is not that it inserts a line but WHAT IT LEAVES ALONE: a member's executor
// carries its own stamped `required_secrets`, and a materialize would have taken them.
test('executor-vars-bag: inserts the bag, preserves each member\'s stamped secrets, and re-runs as a no-op', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'executor-vars-bag');
  assert.ok(m, 'discovered');

  // A real member's shape: the hold, the marker, and secrets only that member has.
  const before = [
    'name: Claudinite executor',
    'jobs:',
    '  execute:',
    '    steps:',
    '      - name: Pick up and execute ready work',
    '        env:',
    '          GITHUB_TOKEN: ${{ github.token }}',
    '          CLAUDINITE_TASKS_SUSPEND_ALL: ${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}',
    '          # claudinite:secrets',
    '          MEMBER_ONLY_TOKEN: ${{ secrets.MEMBER_ONLY_TOKEN }}',
    '        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs',
    '',
  ].join('\n');
  const EXECUTOR = '.github/workflows/claudinite-executor.yml';
  const files = new Map([[EXECUTOR, before]]);
  const io = { read: async (p) => files.get(p) ?? null, write: async (p, c) => { files.set(p, c); },
    env: { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' } };

  assert.equal(await m.appliesTo(io.read), true, 'a member with the hold and no bag');
  assert.deepEqual(await applyRewrites(m, io), [EXECUTOR]);

  const after = files.get(EXECUTOR);
  assert.match(after, /^ {10}CLAUDINITE_VARS: \$\{\{ toJSON\(vars\) \}\}$/m);
  // The member's own secret survives, and so does the marker the wiring converge stamps at.
  assert.match(after, /MEMBER_ONLY_TOKEN: \$\{\{ secrets\.MEMBER_ONLY_TOKEN \}\}/);
  assert.match(after, /^ {10}# claudinite:secrets$/m);
  // The bag sits ABOVE the marker, outside the region the wiring converge regenerates.
  assert.ok(after.indexOf('CLAUDINITE_VARS:') < after.indexOf('# claudinite:secrets'),
    'inside the stamped region the next converge would overwrite it');

  // Re-running must not double the block: appliesTo is the guard, since split/join would
  // happily match the anchor a second time.
  assert.equal(await m.appliesTo(io.read), false);
  assert.equal((after.match(/CLAUDINITE_VARS:/g) ?? []).length, 1);

  // A repo that does not run the queue is untouched.
  assert.equal(await m.appliesTo(async () => null), false);
});

test('executor-vars-redelivery re-issues the same rewrite above where the stranded members landed', async () => {
  const migs = await loadMigrations();
  const reissue = migs.find((x) => x.id === 'executor-vars-redelivery');
  const original = migs.find((x) => x.id === 'executor-vars-bag');
  assert.ok(reissue && original, 'both discovered');

  // The whole point is reach: the members it exists for are stamped ABOVE the original's
  // version, where `migrationApplies` (`want > have`) stops fetching it (#1545).
  assert.ok(versionAbove(reissue.version, original.version),
    'a re-issue at or below the original cannot reach a member that stamped past it');

  // THE DRIFT GUARD. The re-issue COPIES the original's anchor and block rather than
  // importing them, because the vendor set carries only records that still apply — and
  // the members this exists for are exactly the ones the original no longer applies to,
  // so an import would resolve to a file their mount does not carry, fail
  // pack-independence, and stop the converge landing at all. Copied text drifts, so the
  // two are compared here instead.
  assert.deepEqual(reissue.rewrite, original.rewrite,
    'the two records must write the same block; the copy is what pack-independence forces');

  const EXECUTOR = '.github/workflows/claudinite-executor.yml';
  const hold = '          CLAUDINITE_TASKS_SUSPEND_ALL: ${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}\n';
  const stranded = `name: Claudinite executor\n        env:\n${hold}          # claudinite:secrets\n`;
  const files = new Map([[EXECUTOR, stranded]]);
  const io = { read: async (p) => files.get(p) ?? null, write: async (p, c) => { files.set(p, c); },
    env: { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' } };

  assert.equal(await reissue.appliesTo(io.read), true, 'a member left without the line');
  assert.deepEqual(await applyRewrites(reissue, io), [EXECUTOR]);
  assert.match(files.get(EXECUTOR), /^ {10}CLAUDINITE_VARS: \$\{\{ toJSON\(vars\) \}\}$/m);

  // Inert on the members that received it normally — which is what lets one record run
  // fleet-wide instead of naming the five it is for.
  assert.equal(await reissue.appliesTo(io.read), false, 'the line is there now');
  assert.equal((files.get(EXECUTOR).match(/CLAUDINITE_VARS:/g) ?? []).length, 1);
});

// A record is read on a member whose mount carries only the records that still APPLY to
// it, never the canon's whole set — so a record importing a sibling record is a dangling
// import on exactly the repo that needs it, and `pack-independence` then stops the whole
// converge landing (#1545). Caught only by running a real converge; every unit test
// passes, because in the canon tree both files exist.
test('no migration record imports another record', async () => {
  const canon = dirname(dirname(fileURLToPath(import.meta.url)));
  const dirs = migrationDirs();
  assert.ok(dirs.length > 0, 'the live corpus has records');
  for (const d of dirs) {
    const src = readFileSync(join(canon, d, 'migration.mjs'), 'utf8');
    const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(!/migrations\//.test(spec) && !/^\.\.\/\d{4}-\d{2}-\d{2}-/.test(spec),
        `${d} imports another record (${spec}) — its mount may not carry it`);
    }
  }
});

// The record's whole purpose is the line the stub already carries, so the two must not
// drift: an inserted block that differs from the stub leaves adopters and upgraders on
// different executors, and nothing else compares them.
test('executor-vars-bag inserts exactly what the executor stub carries', async () => {
  const { readFileSync } = await import('node:fs');
  const canon = dirname(dirname(fileURLToPath(import.meta.url)));
  const stub = readFileSync(join(canon, 'packs/claudinite-tasks/stubs/claudinite-executor.yml'), 'utf8');
  const src = readFileSync(join(canon, 'packs/claudinite-tasks/migrations/2026-08-31-executor-vars-bag/migration.mjs'), 'utf8');
  // Every line of the record's inserted block appears verbatim in the stub.
  const bag = src.slice(src.indexOf('const BAG = `') + 'const BAG = `'.length, src.indexOf('`;\n\nexport default'));
  for (const line of bag.split('\n').filter((l) => l.trim())) {
    const literal = line.replace(/\\\$/g, '$').replace(/\\`/g, '`');
    assert.ok(stub.includes(literal), `stub is missing the record's line: ${literal.trim()}`);
  }
});
