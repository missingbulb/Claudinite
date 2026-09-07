import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { MEMBER_DECLARATION_CODEMODS, recordsMissingApplyStage } from '../workRules/migration-apply-stage.mjs';

const PACK_RECORD = 'packs/claudinite-tasks/migrations/2026-09-05-thing/migration.mjs';
const ENGINE_RECORD = 'engine/migrations/2026-07-19-thing/migration.mjs';

const record = ({ codemod = 'updateTaskSchedulingFields', applyStage = false } = {}) => `
export default {
  id: 'thing',
  landed: '2026-09-05',
  version: '60906.9',
  summary: 'a thing',
  ${codemod ? `${codemod}: true,` : ''}
  ${applyStage ? "applyStage: { why: 'repair what pins the old shape', instructions: 'run the suite' }," : ''}
};
`;

const work = (changedFiles, files = {}, base = {}) => ({
  changedFiles,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

// --- what counts ------------------------------------------------------------

test('both task-declaration codemods are watched — they write the same member files', () => {
  assert.deepEqual([...MEMBER_DECLARATION_CODEMODS].sort(), ['normalizeLocalDeclarations', 'updateTaskSchedulingFields']);
});

test('a new pack record that rewrites member declarations without an apply stage is a finding', () => {
  const out = recordsMissingApplyStage([PACK_RECORD], (f) => (f === PACK_RECORD ? record() : null), () => null);
  assert.equal(out.length, 1);
  assert.equal(out[0].file, PACK_RECORD);
  assert.match(out[0].what, /updateTaskSchedulingFields/);
});

test('the sibling codemod counts the same — this is the #768 Phase 1 shape', () => {
  const text = record({ codemod: 'normalizeLocalDeclarations' });
  const out = recordsMissingApplyStage([PACK_RECORD], () => text, () => null);
  assert.equal(out.length, 1);
  assert.match(out[0].what, /normalizeLocalDeclarations/);
});

test('declaring an apply stage discharges it', () => {
  const text = record({ applyStage: true });
  assert.deepEqual(recordsMissingApplyStage([PACK_RECORD], () => text, () => null), []);
});

// An engine record CANNOT declare applyStage — assertApplyStageDeclaration throws on
// one ("only a PACK record may declare applyStage"). So the finding has to name the
// other remedy, or it sends the author at a wall the engine itself rejects.
test('an engine record is still a finding, and its remedy is relocation, not a stage', () => {
  const out = recordsMissingApplyStage([ENGINE_RECORD], () => record(), () => null);
  assert.equal(out.length, 1);
  assert.match(out[0].fix, /pack/);
  assert.doesNotMatch(out[0].fix, /declare `applyStage`/);
});

// --- what does not ----------------------------------------------------------

test('a record that writes no member declarations is out of scope', () => {
  const text = record({ codemod: null });
  assert.deepEqual(recordsMissingApplyStage([PACK_RECORD], () => text, () => null), []);
  assert.deepEqual(recordsMissingApplyStage([PACK_RECORD], () => record({ codemod: 'rewrite' }), () => null), []);
});

// The narrowing that keeps this quiet: an already-landed record is already fielded,
// and adding a stage to it now reaches nobody — every member past its version floor
// has applied it. Only a codemod arriving in THIS change can still be carried.
test('a codemod already declared at the base is not re-flagged when the record is edited', () => {
  const text = record();
  assert.deepEqual(recordsMissingApplyStage([PACK_RECORD], () => text, () => text), []);
});

test('a file that is not a dated migration record is out of scope', () => {
  const other = 'packs/claudinite-tasks/queue/executor.mjs';
  assert.deepEqual(recordsMissingApplyStage([other], () => record(), () => null), []);
  const undated = 'packs/claudinite-tasks/migrations/registry.mjs';
  assert.deepEqual(recordsMissingApplyStage([undated], () => record(), () => null), []);
});

test('a commented-out codemod is not a declaration', () => {
  const text = "export default {\n  id: 'thing',\n  // updateTaskSchedulingFields: true,\n};\n";
  assert.deepEqual(recordsMissingApplyStage([PACK_RECORD], () => text, () => null), []);
});

// --- the rule ---------------------------------------------------------------

test('the rule reports the first record and says what is missing', () => {
  const out = rule.run(work([PACK_RECORD], { [PACK_RECORD]: record() }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /apply stage/);
});

test('an empty diff and an unrelated diff are both no-ops', () => {
  assert.deepEqual(rule.run(work([])), []);
  assert.deepEqual(rule.run(work(['README.md'], { 'README.md': record() })), []);
});
