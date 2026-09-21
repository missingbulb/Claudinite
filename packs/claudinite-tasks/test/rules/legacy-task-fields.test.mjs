import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../worldRules/legacy-task-fields.mjs';
import { LEGACY_FIELDS, LEGACY_OUTCOMES, LEGACY_CEILINGS, normalizeTaskDeclaration } from '../../src/contract/task-contract.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const TASK = 'packs/own/tasks/sweep/task.json';
const run = (source, { path = TASK } = {}) => rule.run(ctx({ [path]: source }));

// Every fixture states a trigger, as a real declaration now must. What this rule
// reports is always a retired SPELLING sitting on a line an author can edit — never a
// field that is simply absent, which is the contract's own refusal (#1789).
const declaration = (body) => `{\n  "id": "sweep",\n  "trigger": "request",\n${body}}\n`;

test('legacy-task-fields: silent on a declaration in the current vocabulary', () => {
  assert.deepEqual(run(declaration('  "code_work": "run.mjs",\n  "schedule_after": "other",\n  "expected_outcome": "fresh_pr"\n')), []);
});

// The absence the rule used to report is now a blocking `task-declaration-shape`
// finding, so an advisory here would be the same edit asked for twice.
test('legacy-task-fields: an unstated trigger is not its business', () => {
  assert.deepEqual(run('{\n  "id": "sweep",\n  "preconditions": ["schedule:at-most-daily"],\n  "expected_outcome": "fresh_pr"\n}\n'), []);
});

test('legacy-task-fields: reads task declarations only', () => {
  const legacy = declaration('  "prework": "run.mjs"\n');
  assert.equal(run(legacy).length, 1);
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
  for (const [field, term] of [['daily', 'schedule:at-most-daily'], ['weekly', 'schedule:at-most-weekly'], ['monthly', 'schedule:at-most-monthly'], ['manual', null]]) {
    const findings = run(declaration(`  "frequency": "${field}"\n`));
    assert.equal(findings.length, 1, field);
    assert.match(findings[0].what, /retired field `frequency`/);
    assert.match(findings[0].fix, term === null ? /"trigger": "request"/ : new RegExp(`"preconditions": \\["${term}", …\\]`));
    assert.match(findings[0].fix, term === null ? /no schedule at all/ : /"trigger": "schedule"/, 'the pair the field always meant');
    assert.equal(findings[0].line, 4);
  }
  // A value the door cannot read still names the shape.
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
// a fixture spelling the same dead layout keeps proving the matching. #1633 retired
// the module declaration form entirely under this rule's feet once already.
test('legacy-task-fields: its scope is non-empty over the real tree', () => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url));
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  const declarations = tracked.filter((f) => /(^|\/)tasks\/[^/]+\/task\.json$/.test(f));
  assert.ok(declarations.length > 5, `the rule scans ${declarations.length} real declarations`);
  assert.deepEqual(rule.run(ctx(Object.fromEntries(declarations.map((f) => [f, '{}'])))), []);
});
