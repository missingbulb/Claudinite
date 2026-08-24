import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import rule from '../worldRules/task-code-work-env.mjs';
import { CODE_WORK_ENV_VARS } from '../queue/code-work-run.mjs';

const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const WORKER = 'packs/demo/tasks/thing/worker.mjs';

test('a task reading a variable code_work never sets is a finding', () => {
  const f = rule.run(ctx({ [WORKER]: 'const bag = process.env.CLAUDINITE_OVERRIDES;\n' }));
  assert.equal(f.length, 1);
  assert.match(f[0].what, /CLAUDINITE_OVERRIDES/);
  assert.match(f[0].fix, /CLAUDINITE_CONTEXT/);
});

test('every variable the code_work contract sets is accepted', () => {
  // Quantified over the contract rather than a copy of it: a variable added to
  // `codeWorkEnv` must be legal here the moment it is added, with no edit.
  const src = CODE_WORK_ENV_VARS.map((n) => `process.env.${n};`).join('\n');
  assert.deepEqual(rule.run(ctx({ [WORKER]: src })), []);
});

test('a commented mention of a retired variable is not a read', () => {
  // Both directions: this rule\'s own prose names CLAUDINITE_OVERRIDES, and so does
  // any note in a task explaining why it stopped reading one.
  assert.deepEqual(rule.run(ctx({ [WORKER]: '// CLAUDINITE_OVERRIDES is gone — parameters ride Context\nprocess.env.CLAUDINITE_ITEM;\n' })), []);
});

test('only files under a task directory are in scope', () => {
  assert.deepEqual(rule.run(ctx({ 'engine/x.mjs': 'process.env.CLAUDINITE_OVERRIDES;\n' })), []);
});

test('a test beside a task is not the task', () => {
  // A regression test for this very rule has to name a retired variable as a
  // fixture; flagging that would make the rule unable to be tested.
  assert.deepEqual(rule.run(ctx({ 'packs/demo/tasks/thing/worker.test.mjs': 'process.env.CLAUDINITE_OVERRIDES;\n' })), []);
});

// The pattern-selects-inputs guard: a scope regex left behind by a layout change
// matches nothing, reads as live, and catches nothing — so assert against the real
// tree that it still selects task code.
test('the rule\'s scope is non-empty against this repo', () => {
  const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };
  const seen = [];
  rule.run({ files, read: (f) => { const t = read(f); if (t !== null && /(^|\/)tasks\/[^/]+\/.+\.mjs$/.test(f) && !/\.test\.mjs$/.test(f)) seen.push(f); return t; } });
  assert.ok(seen.length > 20, `expected the rule to read this repo's task modules, saw ${seen.length}`);
});
