import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import rule from '../worldRules/flat-declarations-current.mjs';

const TASK = '.claudinite/shared/packs/acme-pack/tasks/acme-task/task.json';
const LOCAL_TASK = '.claudinite/local/packs/own/tasks/acme-task-b/task.json';
const flatTasks = (tasks) => `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`;
const current = {
  'acme-pack/acme-task': { path: TASK, declaration: { trigger: 'schedule' } },
  'local/own/acme-task-b': { path: LOCAL_TASK, declaration: { trigger: 'request' } },
};
const base = (extra = {}) => ({
  '.claudinite-settings.json': JSON.stringify({ packs: ['acme-pack', 'local/own'] }),
  [TASK]: '{ "trigger": "schedule" }\n',
  '.claudinite/local/packs/own/pack.mjs': 'export default {};\n',
  [LOCAL_TASK]: '{ "trigger": "request" }\n',
  ...extra,
});

function run(files) {
  const root = makeRepo({ base: files });
  try { return runRule(rule, buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
}
const whats = (findings) => findings.map((f) => f.what);

test('flat-declarations-current: a file naming every held task as it reads is silent', () => {
  assert.deepEqual(run(base({ '.claudinite/flat/tasks.GENERATED.json': flatTasks(current) })), []);
});

test('flat-declarations-current: a missing flat file is flagged', () => {
  assert.deepEqual(whats(run(base())), ['.claudinite/flat/tasks.GENERATED.json is missing or unreadable']);
});

test('flat-declarations-current: an edited, a new and a removed task are each flagged', () => {
  const stale = {
    'acme-pack/acme-task': { path: TASK, declaration: { trigger: 'request' } },
    'acme-pack/gone': { path: '.claudinite/shared/packs/acme-pack/tasks/gone/task.json', declaration: {} },
  };
  assert.deepEqual(whats(run(base({ '.claudinite/flat/tasks.GENERATED.json': flatTasks(stale) }))).sort(), [
    `${LOCAL_TASK} is not in .claudinite/flat/tasks.GENERATED.json`,
    `.claudinite/flat/tasks.GENERATED.json carries a copy of ${TASK} that no longer matches it`,
    '.claudinite/flat/tasks.GENERATED.json names "acme-pack/gone", which no declared pack here holds',
  ].sort());
});

test('flat-declarations-current: a task in an undeclared pack is not demanded', () => {
  assert.deepEqual(run({
    '.claudinite-settings.json': JSON.stringify({ packs: [] }),
    [TASK]: '{}\n',
  }), []);
});
