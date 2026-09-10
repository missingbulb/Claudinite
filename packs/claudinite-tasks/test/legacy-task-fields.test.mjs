import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/legacy-task-fields.mjs';
import { normalizeTaskDeclaration } from '../task-contract.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const TASK = 'packs/own/tasks/sweep/task.json';
const run = (source, { path = TASK } = {}) => rule.run(ctx({ [path]: source }));

// Every fixture states a trigger unless the trigger IS its subject: the absence is
// itself reported, so a fixture silent on it would carry a second finding into every
// other case here.
const declaration = (body, { trigger = '  "trigger": "request",\n' } = {}) => `{\n  "id": "sweep",\n${trigger}${body}}\n`;

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

  // No second finding once it is stated.
  assert.deepEqual(run(declaration('  "preconditions": ["due:daily"],\n')), []);
});

test('legacy-task-fields: reads task declarations only', () => {
  const legacy = declaration('  "frequency": "daily"\n');
  assert.equal(run(legacy).length, 1);
  assert.deepEqual(run(legacy, { path: 'packs/own/tasks/sweep/worker.mjs' }), []);
  assert.deepEqual(run(legacy, { path: 'packs/own/task.json' }), []);
});

// The field-name and outcome-ceiling tolerances came out on their own window
// (#1642), so the rule no longer speaks about them at all — the shape check
// reports what a declaration still on one of them now lacks.
test('legacy-task-fields: the retired field names and outcome ceilings are no longer its subject', () => {
  for (const body of ['  "prework": "x"\n', '  "after": "y"\n', '  "required_secrets": ["X"]\n',
    '  "expected_outcome": "open-pr"\n', '  "expected_outcome": "pr"\n']) {
    assert.deepEqual(run(declaration(body)), [], body);
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
  // A value the door cannot read still names the shape.
  assert.match(run(declaration('  "frequency": "hourly"\n'))[0].fix, /due:<daily\|weekly\|monthly>/);
});

test('legacy-task-fields: what it reports is exactly what the door normalizes away', () => {
  assert.equal(normalizeTaskDeclaration({ frequency: 'daily' }).frequency, undefined);
  assert.deepEqual(normalizeTaskDeclaration({ frequency: 'daily' }).preconditions, ['due:daily']);
  // What it no longer reports, the door no longer touches.
  const untouched = normalizeTaskDeclaration({ prework: 'x', after: 'y', expected_outcome: 'open-pr' });
  assert.equal(untouched.prework, 'x');
  assert.equal(untouched.after, 'y');
  assert.equal(untouched.expected_outcome, 'open-pr');
});

test('legacy-task-fields: never blocking', () => {
  const findings = run(declaration('  "frequency": "daily",\n  "expected_outcome": "fresh_pr"\n', { trigger: '' }));
  assert.equal(findings.length, 2, 'the retired field, and the trigger it states nothing about');
  assert.ok(findings.every((f) => f.severity === 'advisory'));
});

// A path pattern left behind by a layout change matches nothing, reads as live, and
// a fixture spelling the same dead layout keeps proving the matching. #1633 retired
// the module declaration form entirely under this rule's feet once already.
test('legacy-task-fields: its scope is non-empty over the real tree', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  const declarations = tracked.filter((f) => /(^|\/)tasks\/[^/]+\/task\.json$/.test(f));
  assert.ok(declarations.length > 5, `the rule scans ${declarations.length} real declarations`);
  assert.deepEqual(rule.run(ctx(Object.fromEntries(declarations.map((f) => [f, '{}'])))), []);
});
