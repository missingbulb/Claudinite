import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import {
  checkoutIo, convertTaskDeclarations, taskDirsWithModule, serializeTaskDeclaration, moduleComments, main,
  LOCAL_PACK_ROOT, CANON_PACK_ROOT, SCHEMA_FILE,
} from '../engine/migrations/task-declarations-to-json.mjs';
import { applyTaskDeclarationConversion, applyMigration, loadMigrations } from '../engine/migrations/registry.mjs';
import { normalizeTaskDeclaration } from '../packs/claudinite-tasks/task-contract.mjs';
import { parseTaskDeclaration } from '../packs/claudinite-tasks/task-declaration.mjs';

const MODULE = `// header: why this task exists
export default {
  id: 'alpha',
  frequency: 'weekly',            // the weekly anchor
  preconditions: ['none'],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  code_work_timeout: 60,
};
`;

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-task-json-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};

const TASK = `${LOCAL_PACK_ROOT}/mypack/tasks/alpha`;

test('convertTaskDeclarations: writes the JSON with $schema, deletes the module, reports the comments', async () => {
  const root = repo({ [`${TASK}/task.mjs`]: MODULE, [`.claudinite/shared/${SCHEMA_FILE}`]: '{}' });
  try {
    const io = checkoutIo(root);
    const dirs = taskDirsWithModule([LOCAL_PACK_ROOT], io);
    assert.deepEqual(dirs, [TASK]);
    const applied = await convertTaskDeclarations(dirs, io);
    assert.equal(applied.length, 1);
    assert.match(applied[0], /task\.mjs -> .*task\.json/);
    assert.match(applied[0], /header: why this task exists/, 'the dropped header is in the report');
    assert.match(applied[0], /the weekly anchor/, 'so is an inline comment');
    assert.ok(!existsSync(join(root, TASK, 'task.mjs')), 'module deleted');
    const json = JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8'));
    assert.equal(json.$schema, `../../../../../shared/${SCHEMA_FILE}`, 'the schema pointer is relative to the task folder, into the mount');
    assert.equal(json.id, 'alpha');
    assert.equal(json.code_work_timeout, 60);
    // Idempotent: nothing left to convert.
    assert.deepEqual(await convertTaskDeclarations(taskDirsWithModule([LOCAL_PACK_ROOT], io), io), []);
  } finally { removeTree(root); }
});

test('convertTaskDeclarations: a folder already carrying task.json keeps it and only loses the module', async () => {
  const root = repo({ [`${TASK}/task.mjs`]: MODULE, [`${TASK}/task.json`]: '{ "id": "alpha", "edited": true }\n' });
  try {
    const applied = await convertTaskDeclarations([TASK], checkoutIo(root));
    assert.match(applied[0], /deleted — .*already exists/);
    assert.equal(JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8')).edited, true);
    assert.ok(!existsSync(join(root, TASK, 'task.mjs')));
  } finally { removeTree(root); }
});

test('serializeTaskDeclaration: a function-valued field is dropped and named; the canon tree points at its own schema', () => {
  const { text, dropped } = serializeTaskDeclaration({ id: 'x', precondition() { return 1; }, frequency: 'daily' }, '../../../claudinite-tasks/task.schema.json');
  assert.deepEqual(dropped, ['precondition']);
  assert.deepEqual(JSON.parse(text), { $schema: '../../../claudinite-tasks/task.schema.json', id: 'x', frequency: 'daily' });
  // Keys land grouped — identity, cadence, outcome, code work, agent — whatever order the module spelled them in.
  const shuffled = serializeTaskDeclaration({ agent_execution_timeout: 5, code_work: 'x', frequency: 'daily', agent_model: 'opus', description: 'd', code_work_timeout: 1, id: 'x', expected_outcome: 'none' }, 's');
  assert.deepEqual(Object.keys(JSON.parse(shuffled.text)), ['$schema', 'id', 'description', 'frequency', 'expected_outcome', 'code_work', 'code_work_timeout', 'agent_model', 'agent_execution_timeout']);
  assert.equal(moduleComments('// a\nexport default {\n  id: 1, // b\n  url: \'http://x\',\n};\n'), 'a\nb');
});

test('the CLI converts a checkout\'s canon and local packs, or the folders it is given', async () => {
  const root = repo({
    [`${CANON_PACK_ROOT}/p/tasks/one/task.mjs`]: MODULE.replace("'alpha'", "'one'"),
    [`${LOCAL_PACK_ROOT}/q/tasks/two/task.mjs`]: MODULE.replace("'alpha'", "'two'"),
    [`${CANON_PACK_ROOT}/p/queue/tasks/three/task.mjs`]: MODULE.replace("'alpha'", "'three'"),
    [SCHEMA_FILE]: '{}',
  });
  try {
    await main(['--root', root]);
    assert.ok(existsSync(join(root, CANON_PACK_ROOT, 'p/tasks/one/task.json')));
    assert.ok(existsSync(join(root, LOCAL_PACK_ROOT, 'q/tasks/two/task.json')));
    assert.ok(existsSync(join(root, CANON_PACK_ROOT, 'p/queue/tasks/three/task.mjs')), 'a folder outside the pack roots is not scanned');
    await main(['--root', root, `${CANON_PACK_ROOT}/p/queue/tasks/three`]);
    const three = JSON.parse(readFileSync(join(root, CANON_PACK_ROOT, 'p/queue/tasks/three/task.json'), 'utf8'));
    assert.equal(three.$schema, '../../../../claudinite-tasks/task.schema.json');
  } finally { removeTree(root); }
});

// The migration op: gated on the record's probe, inert for a caller lacking the
// capabilities, and one runner with every other op (applyMigration).
test('applyTaskDeclarationConversion: converts local packs only, gated on appliesTo and on the io', async () => {
  const root = repo({
    [`${TASK}/task.mjs`]: MODULE,
    [`${CANON_PACK_ROOT}/p/tasks/one/task.mjs`]: MODULE,
    [`.claudinite/shared/${SCHEMA_FILE}`]: '{}',
  });
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    const record = { id: 'r', taskDeclarationsToJson: true, appliesTo: async () => true };
    assert.deepEqual(await applyTaskDeclarationConversion({ id: 'r' }, io), [], 'a record without the flag converts nothing');
    assert.deepEqual(await applyTaskDeclarationConversion({ ...record, appliesTo: async () => false }, io), [], 'the probe gates it');
    const { listDir, ...classic } = io;
    assert.deepEqual(await applyTaskDeclarationConversion(record, classic), [], 'an older caller without the listing converts nothing');
    const applied = await applyMigration(record, io);
    assert.equal(applied.length, 1);
    assert.ok(existsSync(join(root, TASK, 'task.json')));
    assert.ok(existsSync(join(root, CANON_PACK_ROOT, 'p/tasks/one/task.mjs')), 'the shared/canon packs are the canon\'s to convert');
  } finally { removeTree(root); }
});

test('task-declarations-json record: applies only where the mounted pack reads task.json, in either root', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'task-declarations-json');
  assert.ok(m, 'discovered');
  assert.equal(m.taskDeclarationsToJson, true);
  const capable = "export const TASK_DECLARATION_FILE = 'task.json';\n";
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? capable : null)), true, 'a member\'s mount');
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? null : capable)), true, 'the canon\'s own tree');
  assert.equal(await m.appliesTo(async () => "export const TASK_DECLARATION_FILE = 'task.mjs';\n"), false, 'an older pack');
  assert.equal(await m.appliesTo(async () => null), false, 'an unreadable mount is not capable');
  assert.equal(await m.legacyPresent(() => true, async () => 'x'), false);
});

// The canon's own declarations, converted: each loads through the door to a
// complete declaration — pinned here so the conversion is not re-proven by hand
// (the stripped defaults are what the door fills back in).
test('every canon task.json normalizes to a complete declaration', async () => {
  const { execSync } = await import('node:child_process');
  const files = execSync('git ls-files "packs/*/tasks/*/task.json" "packs/*/queue/tasks/*/task.json"', { cwd: join(import.meta.dirname, '..') }).toString().trim().split('\n');
  assert.ok(files.length >= 25, `found ${files.length}`);
  for (const f of files) {
    const decl = normalizeTaskDeclaration(parseTaskDeclaration(readFileSync(join(import.meta.dirname, '..', f), 'utf8')));
    assert.equal(decl.$schema, undefined, `${f}: the pointer leaves at the door`);
    assert.ok(['opus', 'sonnet', 'haiku', 'none'].includes(decl.agent_model), `${f}: model resolved`);
    if (decl.agent_model !== 'none') {
      assert.equal(typeof decl.agent_instructions, 'string', `${f}: worker resolved`);
      assert.ok(Number.isInteger(decl.agent_execution_timeout), `${f}: bound resolved`);
    }
  }
});
