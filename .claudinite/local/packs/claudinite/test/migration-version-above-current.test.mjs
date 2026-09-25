import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrationDirs, recordVersion } from '../../../../../engine/checks/helpers/active-migrations.mjs';
import rule, { recordDeclaredVersion, underpredictedRecords } from '../workRules/migration-version-above-current.mjs';

const PACK_RECORD = 'packs/acme-pack/migrations/2026-09-24-thing/migration.mjs';
const ENGINE_RECORD = 'engine/migrations/2026-09-24-thing/migration.mjs';
const PACK_MANIFEST = 'packs/acme-pack/pack.mjs';
const VERSION_FILE = 'engine/version.mjs';

// `version` on its own line, quoted for a date-anchored value and bare for a legacy
// integer — the two spellings every real record uses, and the only shape the engine's
// synchronous scraper can read.
const record = (version) => `
export default {
  id: 'thing',
  landed: '2026-09-24',
  ${version === null ? '' : `version: ${typeof version === 'number' ? version : `'${version}'`},`}
  summary: 'a thing',
  rewrite: [{ file: 'x', replace: [{ from: 'a', to: 'b' }] }],
};
`;

const packs = (version) => [{ id: 'acme-pack', dir: '/tmp/canon/packs/acme-pack', version }];
const engineSrc = (v) => `// preamble\nexport const ENGINE_VERSION = '${v}';\n`;

const work = (changedFiles, files = {}, base = {}, discovered = packs('60923.3'), deleted = []) => ({
  changedFiles,
  deleted,
  packs: discovered,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

// --- reading the field ------------------------------------------------------

test('recordDeclaredVersion reads the literal in either spelling, and says nothing when there is none', () => {
  assert.equal(recordDeclaredVersion(record('60924.1')), '60924.1');
  // A legacy integer stays a number, as versionFromLiteral hands it over.
  assert.equal(recordDeclaredVersion(record(4)), 4);
  assert.equal(recordDeclaredVersion(record(null)), null);
  // Not on a line of its own is not the field the engine reads, so neither is it ours.
  assert.equal(recordDeclaredVersion('export default { version: 4, };\n'), null);
  assert.equal(recordDeclaredVersion(`// version: '60999.1' is what this WOULD have said\n${record(null)}`), null);
  assert.equal(recordDeclaredVersion(''), null);
  assert.equal(recordDeclaredVersion(null), null);
});

// --- the pack flow: the bump lands AFTER the merge ---------------------------
//
// The boundary case IS the ordinary one: `migrationApplies` is `record > installed`,
// so a record AT the standing version is the first value that reaches nobody.
test('a new pack record at the version standing in the tree is a finding naming both numbers', () => {
  const out = underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record('60923.3') }));
  assert.equal(out.length, 1);
  assert.equal(out[0].file, PACK_RECORD);
  assert.match(out[0].what, /60923\.3/);
  assert.match(out[0].fix, /60923\.3/);
});

test('a version below the standing one is the same finding', () => {
  const out = underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record('60920.4') }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /60920\.4/);
});

test('a legacy integer sorts below every date-anchored version, so it fires too', () => {
  const out = underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record(4) }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /\b4\b/);
});

test('a version above the standing one passes — the shape #2300 landed', () => {
  assert.deepEqual(underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record('60924.1') })), []);
});

// --- every branch that declines to judge ------------------------------------

test('a record whose version this change did not set is out of scope', () => {
  const text = record('60923.3');
  assert.deepEqual(underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: text }, { [PACK_RECORD]: text })), []);
});

test('raising an existing record\'s version IS in scope — that is the pre-merge repair', () => {
  const out = underpredictedRecords(work([PACK_RECORD],
    { [PACK_RECORD]: record('60923.1') }, { [PACK_RECORD]: record('60922.1') }));
  assert.equal(out.length, 1);
});

test('a record with no version at all falls back to the date window, which is another rule\'s business', () => {
  assert.deepEqual(underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record(null) })), []);
});

test('a change that moves the flow\'s own version is not a prediction, so it is skipped', () => {
  assert.deepEqual(underpredictedRecords(work([PACK_RECORD, PACK_MANIFEST], { [PACK_RECORD]: record('60923.3') })), []);
});

test('an unpriceable current version yields no finding rather than an invented gap', () => {
  for (const discovered of [packs(undefined), packs('not-a-version'), []]) {
    assert.deepEqual(underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record('60923.3') }, {}, discovered)), []);
  }
});

test('a record git reports as added because it MOVED is out of scope', () => {
  const from = 'packs/acme-pack/migrations/2026-08-13-thing/migration.mjs';
  const w = work([PACK_RECORD], { [PACK_RECORD]: record('60820.1') },
    { [from]: record('60820.1') }, packs('60923.3'), [from]);
  assert.deepEqual(underpredictedRecords(w), []);
  // Without the deletion the same add is judged, so the guard is the move and not the path.
  assert.equal(underpredictedRecords(work([PACK_RECORD], { [PACK_RECORD]: record('60820.1') })).length, 1);
});

test('an unrelated record being deleted does not excuse a new one under a different id', () => {
  const gone = 'packs/acme-pack/migrations/2026-08-13-other/migration.mjs';
  const other = record('60820.1').replace("id: 'thing'", "id: 'other'");
  const w = work([PACK_RECORD], { [PACK_RECORD]: record('60923.3') }, { [gone]: other }, packs('60923.3'), [gone]);
  assert.equal(underpredictedRecords(w).length, 1);
});

test('an unreadable record is not a finding', () => {
  assert.deepEqual(underpredictedRecords(work([PACK_RECORD], {})), []);
});

test('a file under migrations/ that is not a dated record is out of scope', () => {
  const registry = 'packs/acme-pack/migrations/registry.mjs';
  assert.deepEqual(underpredictedRecords(work([registry], { [registry]: record('60923.3') })), []);
});

test('an empty change finds nothing', () => {
  assert.deepEqual(underpredictedRecords(work([])), []);
  assert.deepEqual(rule.run(work([])), []);
});

// --- the engine flow --------------------------------------------------------

test('an engine record is priced against ENGINE_VERSION, not against a pack', () => {
  const out = underpredictedRecords(work([ENGINE_RECORD],
    { [ENGINE_RECORD]: record('60902.1'), [VERSION_FILE]: engineSrc('60902.1') }));
  assert.equal(out.length, 1);
  assert.equal(out[0].file, ENGINE_RECORD);
  assert.match(out[0].what, /60902\.1/);
});

test('an engine record above ENGINE_VERSION passes', () => {
  assert.deepEqual(underpredictedRecords(work([ENGINE_RECORD],
    { [ENGINE_RECORD]: record('60930.1'), [VERSION_FILE]: engineSrc('60902.1') })), []);
});

test('a release that bumps ENGINE_VERSION in the same change is skipped', () => {
  assert.deepEqual(underpredictedRecords(work([ENGINE_RECORD, VERSION_FILE],
    { [ENGINE_RECORD]: record('60930.1'), [VERSION_FILE]: engineSrc('60930.1') })), []);
});

// --- the drift guard ---------------------------------------------------------
//
// Two readings of one field: this rule scrapes the record's text (it needs the BASE
// side too, which no filesystem read can give), the engine scrapes the file. A record
// the engine prices and this rule does not would pass a version nothing can use.
test('this rule and the engine read every real record\'s version identically', () => {
  const dirs = migrationDirs();
  assert.ok(dirs.length >= 25, `expected the corpus's records, found ${dirs.length}`);
  for (const dir of dirs) {
    const mine = recordDeclaredVersion(readFileSync(`${dir}/migration.mjs`, 'utf8'));
    assert.deepEqual(mine, recordVersion(dir), dir);
  }
});

// --- the rule reports one of several ----------------------------------------

test('two under-predicted records in one change report the first', () => {
  const other = 'packs/acme-pack/migrations/2026-09-24-other/migration.mjs';
  const out = rule.run(work([PACK_RECORD, other],
    { [PACK_RECORD]: record('60923.3'), [other]: record('60922.1') }));
  assert.equal(out.length, 1);
  assert.equal(out[0].file, PACK_RECORD);
});
