import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFlat, flatTaskRows, FLAT_TASKS_PATH } from '../src/read/flat.mjs';
import { declaredPackDirs, parseDeclaration } from '../src/derive/model.mjs';
import { readRollingText, USAGE_PATH, LEGACY_USAGE_PATH } from '../src/read/usage.mjs';

const ctx = (files, asked = []) => ({
  repo: 'o/r', sha: 's', token: 't', paths: Object.keys(files),
  gh: { getTextAtSha: async (_r, _s, path) => { asked.push(path); return files[path] ?? null; } },
});

test('readFlat answers null, and spends no read, where the listing carries no flat file', async () => {
  const asked = [];
  assert.equal(await readFlat(ctx({ 'README.md': 'x' }, asked), FLAT_TASKS_PATH, 'tasks'), null);
  assert.deepEqual(asked, []);
});

test('the flat task rows are the declared packs\' tasks, a local pack keyed as it is declared', async () => {
  const file = JSON.stringify({ version: 1, tasks: {
    'acme-pack/acme-task': { path: '.claudinite/shared/packs/acme-pack/tasks/acme-task/task.json', declaration: { trigger: 'schedule', preconditions: ['schedule:at-most-daily'] } },
    'local/own/acme-task-b': { path: '.claudinite/local/packs/own/tasks/acme-task-b/task.json', text: '{ not json' },
    'acme-undeclared/acme-task-c': { path: 'x', declaration: {} },
  } });
  const entries = await readFlat(ctx({ [FLAT_TASKS_PATH]: file }), FLAT_TASKS_PATH, 'tasks');
  const rows = flatTaskRows(entries, declaredPackDirs({ packs: ['acme-pack', 'local/own'] }));
  assert.deepEqual(rows.map((r) => [r.pack, r.task]), [['acme-pack', 'acme-task'], ['local/own', 'acme-task-b']]);
  assert.equal(parseDeclaration(rows[0].text).trigger, 'schedule');
  assert.deepEqual(parseDeclaration(rows[1].text), parseDeclaration('{ not json'), 'an unparsable source reads exactly as it would one by one');
});

test('a rolling file is read at its new path, and at the old one only when the new is absent', async () => {
  const reader = (files, asked) => async (path) => { asked.push(path); return files[path] ?? null; };
  const moved = [];
  assert.equal(await readRollingText(reader({ [USAGE_PATH]: 'new', [LEGACY_USAGE_PATH]: 'old' }, moved), USAGE_PATH, LEGACY_USAGE_PATH), 'new');
  assert.deepEqual(moved, [USAGE_PATH]);
  const unmoved = [];
  assert.equal(await readRollingText(reader({ [LEGACY_USAGE_PATH]: 'old' }, unmoved), USAGE_PATH, LEGACY_USAGE_PATH), 'old');
  assert.equal(await readRollingText(reader({}, []), USAGE_PATH, LEGACY_USAGE_PATH), null);
});
