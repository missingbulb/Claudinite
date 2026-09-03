import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-task-fields.mjs';
import { LEGACY_FIELDS, LEGACY_OUTCOMES, normalizeTaskDeclaration } from '../task-contract.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const TASK = 'packs/own/tasks/sweep/task.json';
const run = (source, { path = TASK } = {}) => rule.run(ctx({ [path]: source }));

// The JSON declaration is today's form; the module form is itself a tolerance the
// door still accepts, so both are read and both are asserted below.
const declaration = (body) => `{\n  "id": "sweep",\n${body}}\n`;
const moduleDeclaration = (body) => `export default {\n  id: 'sweep',\n${body}};\n`;

test('legacy-task-fields: silent on a declaration in the current vocabulary', () => {
  assert.deepEqual(run(declaration('  "code_work": "run.mjs",\n  "schedule_after": "other",\n  "expected_outcome": "pr"\n')), []);
});

test('legacy-task-fields: reads task declarations only, in either form', () => {
  const legacy = declaration('  "prework": "run.mjs"\n');
  assert.equal(run(legacy).length, 1);
  // task.mjs is the retired declaration form, still accepted at the door — a
  // declaration that never converted is exactly where an old field name survives.
  assert.equal(run(moduleDeclaration("  prework: 'run.mjs',\n"), { path: 'packs/own/tasks/sweep/task.mjs' }).length, 1);
  assert.deepEqual(run(legacy, { path: 'packs/own/tasks/sweep/worker.mjs' }), []);
  assert.deepEqual(run(legacy, { path: 'packs/own/task.json' }), []);
});

test('legacy-task-fields: every retired field name is reported at its own line, with its replacement', () => {
  const body = Object.keys(LEGACY_FIELDS).map((f) => `  "${f}": "x",\n`).join('');
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
    const findings = run(declaration(`  "expected_outcome": "${legacy}"\n`));
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, new RegExp(`retired outcome ceiling \`${legacy}\``));
    assert.match(findings[0].fix, new RegExp(`automerge: '${policy}'`));
  }
  assert.deepEqual(run(declaration('  "expected_outcome": "pr"\n')), []);
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
  const findings = run(declaration('  "prework": "x",\n  "expected_outcome": "open-pr"\n'));
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.severity === 'advisory'));
});

// A path pattern left behind by a layout change matches nothing, reads as live, and
// a fixture spelling the same dead layout keeps proving the matching. #1636 moved
// declarations from task.mjs to task.json under this rule's feet once already.
test('legacy-task-fields: its scope is non-empty over the real tree', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  const declarations = tracked.filter((f) => /(^|\/)tasks\/[^/]+\/task\.(json|mjs)$/.test(f));
  assert.ok(declarations.length > 5, `the rule scans ${declarations.length} real declarations`);
  assert.deepEqual(rule.run(ctx(Object.fromEntries(declarations.map((f) => [f, '{}'])))), []);
});
