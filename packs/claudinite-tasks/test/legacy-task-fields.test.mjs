import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-task-fields.mjs';
import { LEGACY_FIELDS, LEGACY_OUTCOMES, normalizeTaskDeclaration } from '../task-contract.mjs';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const TASK = 'packs/own/tasks/sweep/task.mjs';
const run = (source, { path = TASK } = {}) => rule.run(ctx({ [path]: source }));

const declaration = (body) => `export default {\n  id: 'sweep',\n${body}};\n`;

test('legacy-task-fields: silent on a declaration in the current vocabulary', () => {
  assert.deepEqual(run(declaration("  code_work: 'run.mjs',\n  schedule_after: 'other',\n  expected_outcome: 'pr',\n")), []);
});

test('legacy-task-fields: reads task declarations only', () => {
  const legacy = declaration("  prework: 'run.mjs',\n");
  assert.equal(run(legacy).length, 1);
  assert.deepEqual(run(legacy, { path: 'packs/own/tasks/sweep/worker.mjs' }), []);
  assert.deepEqual(run(legacy, { path: 'packs/own/task.mjs' }), []);
});

test('legacy-task-fields: every retired field name is reported at its own line, with its replacement', () => {
  const body = Object.keys(LEGACY_FIELDS).map((f) => `  ${f}: 'x',\n`).join('');
  const findings = run(declaration(body));
  assert.equal(findings.length, Object.keys(LEGACY_FIELDS).length);
  for (const finding of findings) {
    const legacy = /`([a-z_]+)`/.exec(finding.what)[1];
    assert.ok(Object.hasOwn(LEGACY_FIELDS, legacy));
    assert.match(finding.fix, new RegExp(`rename it to \`${LEGACY_FIELDS[legacy]}\``));
    assert.ok(finding.line > 0);
  }
});

test('legacy-task-fields: a retired outcome ceiling is reported as the pair it always meant', () => {
  for (const [legacy, policy] of Object.entries(LEGACY_OUTCOMES)) {
    const findings = run(declaration(`  expected_outcome: '${legacy}',\n`));
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, new RegExp(`retired outcome ceiling \`${legacy}\``));
    assert.match(findings[0].fix, new RegExp(`automerge: '${policy}'`));
  }
  assert.deepEqual(run(declaration("  expected_outcome: 'pr',\n")), []);
});

// The advisory exists because the tolerance is invisible downstream: by the time
// anything holds a declaration, the door has already renamed the field away.
test('legacy-task-fields: what it reports is exactly what the door normalizes away', () => {
  const normalized = normalizeTaskDeclaration({ prework: 'x', after: 'y', expected_outcome: 'open-pr' });
  assert.equal(normalized.prework, undefined);
  assert.equal(normalized.after, undefined);
  assert.equal(normalized.expected_outcome, 'pr');
});

test('legacy-task-fields: never blocking', () => {
  const findings = run(declaration("  prework: 'x',\n  expected_outcome: 'open-pr',\n"));
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.severity === 'advisory'));
});
