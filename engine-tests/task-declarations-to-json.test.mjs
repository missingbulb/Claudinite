import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import {
  checkoutIo, convertTaskDeclarations, taskDirsWithModule, serializeTaskDeclaration, moduleComments, main,
  retireFrequencyText, retireTaskFrequency, taskDirsWithJson,
  LOCAL_PACK_ROOT, CANON_PACK_ROOT, SCHEMA_FILE,
} from '../engine/migrations/task-declarations-to-json.mjs';
import { applyTaskDeclarationConversion, applyTaskFrequencyRetirement, applyMigration, loadMigrations } from '../engine/migrations/registry.mjs';
import { ACCEPTED_FREQUENCIES } from '../packs/claudinite-tasks/calendar.mjs';
import { normalizeTaskDeclaration } from '../packs/claudinite-tasks/task-contract.mjs';
import { parseTaskDeclaration } from '../packs/claudinite-tasks/task-declaration.mjs';

const MODULE = `// header: why this task exists
export default {
  id: 'alpha',
  frequency: 'weekly',            // the weekly anchor
  preconditions: ['none'],
  agent_model: 'none',
  expected_outcome: 'no_code_changes',
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
    const readme = readFileSync(join(root, TASK, 'README.md'), 'utf8');
    assert.match(readme, /^# alpha\n/, 'a README is created for the task');
    assert.match(readme, /## Why the declaration reads as it does\n[^]*header: why this task exists\n[^]*the weekly anchor/, 'the comments live in the README now');
    const json = JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8'));
    assert.equal(json.$schema, `../../../../../shared/${SCHEMA_FILE}`, 'the schema pointer is relative to the task folder, into the mount');
    assert.equal(json.id, 'alpha');
    assert.equal(json.code_work_timeout, 60);
    // Idempotent: nothing left to convert.
    assert.deepEqual(await convertTaskDeclarations(taskDirsWithModule([LOCAL_PACK_ROOT], io), io), []);
  } finally { removeTree(root); }
});

test('convertTaskDeclarations: an existing README gains the notes section below its own content', async () => {
  const root = repo({ [`${TASK}/task.mjs`]: MODULE, [`${TASK}/README.md`]: '# alpha\n\nWhat the worker does.\n' });
  try {
    await convertTaskDeclarations([TASK], checkoutIo(root));
    const readme = readFileSync(join(root, TASK, 'README.md'), 'utf8');
    assert.ok(readme.startsWith('# alpha\n\nWhat the worker does.\n\n## Why the declaration reads as it does'), readme);
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
  // Keys land grouped — identity, when it runs, outcome, code work, agent — whatever order the
  // module spelled them in; a key the order does not list (the retired `frequency`) keeps its
  // place after the listed ones.
  const shuffled = serializeTaskDeclaration({ agent_execution_timeout: 5, code_work: 'x', frequency: 'daily', agent_model: 'opus', description: 'd', preconditions: ['substantive-change'], code_work_timeout: 1, id: 'x', expected_outcome: 'no_code_changes' }, 's');
  assert.deepEqual(Object.keys(JSON.parse(shuffled.text)), ['$schema', 'id', 'description', 'preconditions', 'expected_outcome', 'code_work', 'code_work_timeout', 'agent_model', 'agent_execution_timeout', 'frequency']);
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
  const capable = "export const TASK_DECLARATION_FILE = 'task.json';\n";
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? capable : null)), true, 'a member\'s mount');
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? null : capable)), true, 'the canon\'s own tree');
  assert.equal(await m.appliesTo(async () => "export const TASK_DECLARATION_FILE = 'task.mjs';\n"), false, 'an older pack');
  assert.equal(await m.appliesTo(async () => null), false, 'an unreadable mount is not capable');
  assert.equal(await m.legacyPresent(() => true, async () => 'x'), false);
});

test('task-declarations-json record: run through the one runner, it converts a member\'s local task module', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'task-declarations-json');
  const root = repo({
    [`${TASK}/task.mjs`]: MODULE,
    [`.claudinite/shared/${SCHEMA_FILE}`]: '{}',
    // The mount the record probes: a tasks pack that already reads task.json.
    '.claudinite/shared/packs/claudinite-tasks/task-declaration-text.mjs': "export const TASK_DECLARATION_FILE = 'task.json';\n",
  });
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    const applied = await applyMigration(m, io);
    assert.equal(applied.length, 1, applied.join(' | '));
    assert.ok(existsSync(join(root, TASK, 'task.json')));
    assert.ok(!existsSync(join(root, TASK, 'task.mjs')));
  } finally { removeTree(root); }
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

// The conversion deletes task.mjs, so a sibling that imported it stops resolving —
// and a task whose worker cannot load is a blocking park, not a degraded run
// (Shepherd#449 froze its lane exactly this way). Converting the declaration and
// leaving its importers behind is half a migration.
test('convertTaskDeclarations: rewrites the siblings that imported the module', async () => {
  const root = repo({
    [`${TASK}/task.mjs`]: MODULE,
    [`${TASK}/worker.mjs`]: "import task from './task.mjs';\nconsole.log(task.id);\n",
    [`${TASK}/task.test.mjs`]: 'import task from "./task.mjs";\n',
    [`.claudinite/shared/${SCHEMA_FILE}`]: '{}',
  });
  try {
    await convertTaskDeclarations([TASK], checkoutIo(root));
    const worker = readFileSync(join(root, TASK, 'worker.mjs'), 'utf8');
    const spec = readFileSync(join(root, TASK, 'task.test.mjs'), 'utf8');
    assert.match(worker, /import task from '\.\/task\.json' with \{ type: 'json' \};/);
    assert.match(spec, /import task from "\.\/task\.json" with \{ type: "json" \};/);
    for (const t of [worker, spec]) assert.doesNotMatch(t, /task\.mjs/, 'no dangling reference to the deleted module');
  } finally { removeTree(root); }
});
// --- the retired `frequency` field, folded into the expression (tasks-dispatch DESIGN §5, #1725)
// A member's own task.json is patched as ANCHORED TEXT — never re-serialized —
// because a hand-written file's indentation, key order and comments-by-way-of-
// layout are its author's, and a round-trip would rewrite them while nothing failed.

test('retireFrequencyText: the field becomes the first condition; a none beside it drops; the layout survives', () => {
  const before = '{\n  "$schema": "s",\n  "id": "sweep",\n  "frequency": "weekly",\n  "preconditions": [\n    "none"\n  ],\n  "expected_outcome": "no_code_changes"\n}\n';
  const out = retireFrequencyText(before);
  assert.equal(out.term, 'due:weekly');
  assert.equal(out.text, '{\n  "$schema": "s",\n  "id": "sweep",\n  "preconditions": [\n    "due:weekly"\n  ],\n  "expected_outcome": "no_code_changes"\n}\n');
  assert.deepEqual(JSON.parse(out.text).preconditions, ['due:weekly']);

  const stated = '{\n  "id": "sweep",\n  "frequency": "daily",\n  "preconditions": [\n    "substantive-change",\n    "no-open-pr-titled:My sweep"\n  ]\n}\n';
  assert.deepEqual(JSON.parse(retireFrequencyText(stated).text).preconditions, ['due:daily', 'substantive-change', 'no-open-pr-titled:My sweep']);
  assert.match(retireFrequencyText(stated).text, /\n    "due:daily",\n    "substantive-change",\n/, 'the array keeps its own indentation');

  const inline = '{ "id": "x", "frequency": "manual", "preconditions": ["request-eligible"] }\n';
  assert.equal(retireFrequencyText(inline).text, '{ "id": "x", "preconditions": ["request-eligible"] }\n');
  // `manual` meant no schedule: the field goes, and a list it leaves empty goes with it.
  const manual = '{\n  "id": "lever",\n  "frequency": "manual",\n  "preconditions": [\n    "none"\n  ],\n  "expected_outcome": "no_code_changes"\n}\n';
  const dropped = retireFrequencyText(manual);
  assert.equal(dropped.term, null);
  assert.equal(dropped.text, '{\n  "id": "lever",\n  "expected_outcome": "no_code_changes"\n}\n');
  assert.equal(retireFrequencyText('{ "id": "x", "frequency": "manual" }\n').text, '{ "id": "x" }\n');
});

test('retireFrequencyText: with no preconditions the field\'s own line becomes the list, comma and indent kept', () => {
  const middle = '{\n  "id": "x",\n  "frequency": "monthly",\n  "expected_outcome": "fresh_pr"\n}\n';
  assert.equal(retireFrequencyText(middle).text, '{\n  "id": "x",\n  "preconditions": [\n    "due:monthly"\n  ],\n  "expected_outcome": "fresh_pr"\n}\n');
  // The last key carries no comma, and neither does what replaces it.
  const last = '{\n  "id": "x",\n  "frequency": "daily"\n}\n';
  assert.equal(retireFrequencyText(last).text, '{\n  "id": "x",\n  "preconditions": [\n    "due:daily"\n  ]\n}\n');
  // …and when the field was last and the list already exists, the line before it loses its comma.
  const lastWithList = '{\n  "id": "x",\n  "preconditions": ["repo-active"],\n  "frequency": "weekly"\n}\n';
  assert.equal(retireFrequencyText(lastWithList).text, '{\n  "id": "x",\n  "preconditions": ["due:weekly", "repo-active"]\n}\n');
});

test('retireFrequencyText: nothing to do, a term already stated, and an unknown value', () => {
  assert.equal(retireFrequencyText('{\n  "id": "x",\n  "preconditions": ["due:daily"]\n}\n'), null, 'no field, no rewrite');
  const doubled = '{\n  "id": "x",\n  "frequency": "daily",\n  "preconditions": ["due:daily", "any-commit"]\n}\n';
  assert.deepEqual(JSON.parse(retireFrequencyText(doubled).text).preconditions, ['due:daily', 'any-commit'], 'never given the term twice');
  // A value the door cannot read still leaves the file: the illegal condition it
  // becomes is what the contract then reports, exactly as the door reads it.
  assert.deepEqual(JSON.parse(retireFrequencyText('{\n  "id": "x",\n  "frequency": "hourly"\n}\n').text).preconditions, ['due:hourly']);
  // A file the patch would leave unparsable is left alone and said so.
  assert.equal(retireFrequencyText('{\n  "id": "x",\n  "frequency": "daily",\n  "preconditions": [1, 2\n}\n'), null);
});

test('retireFrequencyText agrees with the contract\'s door on every accepted value', () => {
  // Two spellings of one mapping: the engine cannot import the pack, so the term
  // it writes is pinned to what the door reads (`cadenceTermFor`).
  for (const f of ACCEPTED_FREQUENCIES) {
    const text = `{\n  "id": "x",\n  "frequency": "${f}",\n  "preconditions": ["repo-active"]\n}\n`;
    assert.deepEqual(JSON.parse(retireFrequencyText(text).text).preconditions, normalizeTaskDeclaration({ frequency: f, preconditions: ['repo-active'] }).preconditions, f);
  }
});

test('retireTaskFrequency rewrites every local task.json carrying the field, and reports each', async () => {
  const root = repo({
    [`${TASK}/task.json`]: '{\n  "id": "alpha",\n  "frequency": "daily",\n  "preconditions": ["none"]\n}\n',
    [`${LOCAL_PACK_ROOT}/mypack/tasks/beta/task.json`]: '{\n  "id": "beta",\n  "expected_outcome": "no_code_changes"\n}\n',
    [`${CANON_PACK_ROOT}/p/tasks/one/task.json`]: '{\n  "id": "one",\n  "frequency": "daily"\n}\n',
  });
  try {
    const io = checkoutIo(root);
    const applied = await retireTaskFrequency(taskDirsWithJson([LOCAL_PACK_ROOT], io), io);
    assert.equal(applied.length, 1);
    assert.match(applied[0], /alpha\/task\.json: frequency "daily" → "due:daily"/);
    assert.deepEqual(JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8')).preconditions, ['due:daily']);
    assert.match(readFileSync(join(root, CANON_PACK_ROOT, 'p/tasks/one/task.json'), 'utf8'), /"frequency"/, 'the canon packs are the canon\'s');
    assert.deepEqual(await retireTaskFrequency(taskDirsWithJson([LOCAL_PACK_ROOT], io), io), [], 'idempotent: nothing left to rewrite');
  } finally { removeTree(root); }
});

test('applyTaskFrequencyRetirement: gated on the flag, the probe and the io, and one runner with every other op', async () => {
  const root = repo({ [`${TASK}/task.json`]: '{\n  "id": "alpha",\n  "frequency": "weekly"\n}\n' });
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    const record = { id: 'r', retireTaskFrequency: true, appliesTo: async () => true };
    assert.deepEqual(await applyTaskFrequencyRetirement({ id: 'r' }, io), [], 'a record without the flag rewrites nothing');
    assert.deepEqual(await applyTaskFrequencyRetirement({ ...record, appliesTo: async () => false }, io), [], 'the probe gates it');
    const { listDir, ...classic } = io;
    assert.deepEqual(await applyTaskFrequencyRetirement(record, classic), [], 'an older caller without the listing rewrites nothing');
    const applied = await applyMigration(record, io);
    assert.equal(applied.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8')).preconditions, ['due:weekly']);
  } finally { removeTree(root); }
});

test('task-cadence-terms record: applies only where the mounted pack reads the cadence term, in either root', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'task-cadence-terms');
  assert.ok(m, 'discovered');
  assert.equal(m.retireTaskFrequency, true);
  const capable = 'export const cadenceTermFor = (frequency) => …;\n';
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? capable : null)), true, 'a member\'s mount');
  assert.equal(await m.appliesTo(async (p) => (p.startsWith('.claudinite/shared/') ? null : capable)), true, 'the canon\'s own tree');
  assert.equal(await m.appliesTo(async () => 'export const FREQUENCIES = [];\n'), false, 'an older pack');
  assert.equal(await m.appliesTo(async () => null), false, 'an unreadable mount is not capable');
  assert.equal(await m.legacyPresent(() => true, async () => 'x'), false);
  assert.equal(m.applyStage, undefined, 'a text rewrite needs no session');
});
