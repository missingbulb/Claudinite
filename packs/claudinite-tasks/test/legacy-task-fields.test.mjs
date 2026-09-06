import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-task-fields.mjs';
import { LEGACY_FIELDS, LEGACY_OUTCOMES, LEGACY_CEILINGS, normalizeTaskDeclaration } from '../task-contract.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const TASK = 'packs/own/tasks/sweep/task.json';
const run = (source, { path = TASK } = {}) => rule.run(ctx({ [path]: source }));

// The JSON declaration is today's form; the module form is itself a tolerance the
// door still accepts, so both are read and both are asserted below.
// Every fixture states a trigger unless the trigger IS its subject: the absence is
// itself reported, so a fixture silent on it would carry a second finding into every
// other case here.
const declaration = (body, { trigger = '  "trigger": "request",\n' } = {}) => `{\n  "id": "sweep",\n${trigger}${body}}\n`;
const moduleDeclaration = (body, { trigger = "  trigger: 'request',\n" } = {}) => `export default {\n  id: 'sweep',\n${trigger}${body}};\n`;

test('legacy-task-fields: silent on a declaration in the current vocabulary', () => {
  assert.deepEqual(run(declaration('  "code_work": "run.mjs",\n  "schedule_after": "other",\n  "expected_outcome": "fresh_pr"\n')), []);
});

// The trigger is DERIVED for a declaration that states none, so unlike every other
// entry here the thing reported is an ABSENCE — nothing on the page is wrong, and
// nothing goes red when the derivation is dropped (#1789) except the task not running.
test('legacy-task-fields: a declaration stating no trigger is reported at the line it belongs on', () => {
  const none = { trigger: '' };
  const listed = run(declaration('  "preconditions": ["due:daily"],\n  "expected_outcome": "fresh_pr"\n', none));
  assert.equal(listed.length, 1);
  assert.match(listed[0].what, /states no `trigger`/);
  assert.match(listed[0].fix, /"trigger": "schedule"/, 'the value its own conditions imply');
  assert.equal(listed[0].line, 3, 'the `preconditions` line, where the field goes');

  // With no conditions the implied value flips, and the anchor falls to the field
  // the contract requires — the same two anchors the nightly rewrite uses.
  const bare = run(declaration('  "expected_outcome": "fresh_pr"\n', none));
  assert.match(bare[0].fix, /"trigger": "request"/);
  assert.equal(bare[0].line, 3);

  // Both declaration forms, and no second finding once it is stated.
  assert.equal(run(moduleDeclaration("  preconditions: ['due:daily'],\n", none)).length, 1);
  assert.deepEqual(run(moduleDeclaration("  preconditions: ['due:daily'],\n")), []);
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
  assert.deepEqual(run(declaration('  "expected_outcome": "fresh_pr"\n')), []);
});

// The two-word ceilings are the other retired generation: each became one of the
// four words that say what the run does to pull requests, and the fix names it.
test('legacy-task-fields: a two-word ceiling is reported as the word it became', () => {
  for (const [legacy, today] of Object.entries(LEGACY_CEILINGS)) {
    const findings = run(declaration(`  "expected_outcome": "${legacy}"\n`));
    assert.equal(findings.length, 1, legacy);
    assert.match(findings[0].what, new RegExp(`retired outcome ceiling \`${legacy}\``));
    assert.match(findings[0].fix, new RegExp(`expected_outcome: '${today}'`));
    assert.equal(findings[0].severity, 'advisory');
  }
});

// The advisory exists because the tolerance is invisible downstream: by the time
// anything holds a declaration, the door has already renamed the field away.
test('legacy-task-fields: the retired frequency field is reported with the condition it reads as', () => {
  for (const [field, term] of [['daily', 'due:daily'], ['weekly', 'due:weekly'], ['monthly', 'due:monthly'], ['manual', null]]) {
    const findings = run(declaration(`  "frequency": "${field}"\n`));
    assert.equal(findings.length, 1, field);
    assert.match(findings[0].what, /retired field `frequency`/);
    assert.match(findings[0].fix, term === null ? /"trigger": "request"/ : new RegExp(`"preconditions": \\["${term}", …\\]`));
    assert.match(findings[0].fix, term === null ? /no schedule at all/ : /"trigger": "schedule"/, 'the pair the field always meant');
    assert.equal(findings[0].line, 4);
  }
  // The module form too, and a value the door cannot read still names the shape.
  assert.equal(run(moduleDeclaration("  frequency: 'daily',\n"), { path: 'packs/own/tasks/sweep/task.mjs' }).length, 1);
  assert.match(run(declaration('  "frequency": "hourly"\n'))[0].fix, /due:<daily\|weekly\|monthly>/);
});

test('legacy-task-fields: what it reports is exactly what the door normalizes away', () => {
  const normalized = normalizeTaskDeclaration({ prework: 'x', after: 'y', expected_outcome: 'open-pr' });
  assert.equal(normalized.prework, undefined);
  assert.equal(normalized.after, undefined);
  assert.equal(normalized.expected_outcome, 'fresh_pr');
  assert.equal(normalizeTaskDeclaration({ expected_outcome: 'none' }).expected_outcome, 'no_code_changes');
  assert.equal(normalizeTaskDeclaration({ frequency: 'daily' }).frequency, undefined);
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
