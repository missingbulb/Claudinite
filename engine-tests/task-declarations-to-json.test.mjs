import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../engine/remove-tree.mjs';
import {
  checkoutIo, main,
  retireFrequencyText, stateTriggerText, updateTaskSchedulingFields, taskDirsWithJson,
  LOCAL_PACK_ROOT, CANON_PACK_ROOT,
} from '../engine/migrations/task-declarations-to-json.mjs';
import { applyTaskSchedulingFields, applyMigration, loadMigrations } from '../engine/migrations/registry.mjs';
import { ACCEPTED_FREQUENCIES } from '../packs/claudinite-tasks/calendar.mjs';
import { normalizeTaskDeclaration } from '../packs/claudinite-tasks/task-contract.mjs';
import { parseTaskDeclaration } from '../packs/claudinite-tasks/task-declaration.mjs';

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-task-json-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};

const TASK = `${LOCAL_PACK_ROOT}/mypack/tasks/alpha`;

// The canon's own declarations: each loads through the door to a complete
// declaration (the stripped defaults are what the door fills back in).
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

test('the CLI rewrites a checkout\'s canon and local packs, or the folders it is given', async () => {
  const root = repo({
    [`${CANON_PACK_ROOT}/p/tasks/one/task.json`]: '{\n  "id": "one",\n  "frequency": "daily"\n}\n',
    [`${LOCAL_PACK_ROOT}/q/tasks/two/task.json`]: '{\n  "id": "two",\n  "frequency": "weekly"\n}\n',
    [`${CANON_PACK_ROOT}/p/queue/tasks/three/task.json`]: '{\n  "id": "three",\n  "frequency": "daily"\n}\n',
  });
  try {
    await main(['--root', root]);
    const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    assert.deepEqual(read(`${CANON_PACK_ROOT}/p/tasks/one/task.json`).preconditions, ['due:daily']);
    assert.deepEqual(read(`${LOCAL_PACK_ROOT}/q/tasks/two/task.json`).preconditions, ['due:weekly']);
    assert.equal(read(`${CANON_PACK_ROOT}/p/queue/tasks/three/task.json`).frequency, 'daily', 'a folder outside the pack roots is not scanned');
    await main(['--root', root, `${CANON_PACK_ROOT}/p/queue/tasks/three`]);
    assert.deepEqual(read(`${CANON_PACK_ROOT}/p/queue/tasks/three/task.json`).preconditions, ['due:daily']);
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

// --- the unstated `trigger` ------------------------------------------------------

test('stateTriggerText writes the answer the conditions already gave, keeping the layout', () => {
  const listed = '{\n  "id": "x",\n  "preconditions": [\n    "due:daily"\n  ],\n  "expected_outcome": "fresh_pr"\n}\n';
  assert.equal(stateTriggerText(listed).trigger, 'schedule');
  assert.match(stateTriggerText(listed).text, /\n  "trigger": "schedule",\n  "preconditions": \[/, 'a line of its own at the key\'s indent');
  // No conditions: `preconditions` may not be there to anchor on, so the required
  // outcome field is — and the field goes BEFORE it, never after a trailing key.
  const bare = '{\n  "id": "x",\n  "description": "d",\n  "expected_outcome": "fresh_pr"\n}\n';
  assert.equal(stateTriggerText(bare).text, '{\n  "id": "x",\n  "description": "d",\n  "trigger": "request",\n  "expected_outcome": "fresh_pr"\n}\n');
  // One-line object: the separator it uses, not a new line.
  assert.equal(stateTriggerText('{ "id": "x", "preconditions": ["due:daily"] }\n').text,
    '{ "id": "x", "trigger": "schedule", "preconditions": ["due:daily"] }\n');
  // Nothing to do, and nothing safe to do.
  assert.equal(stateTriggerText('{\n  "id": "x",\n  "trigger": "request",\n  "preconditions": []\n}\n'), null, 'already stated');
  assert.equal(stateTriggerText('{\n  "id": "x",\n  "preconditions": [1\n}\n'), null, 'does not parse');
  assert.equal(stateTriggerText('{\n  "id": "x"\n}\n'), null, 'no anchor to place it against');
});

test('stateTriggerText agrees with the contract\'s door on every shape of expression', () => {
  // Two spellings of one rule: the engine cannot import the pack, so what it writes
  // is pinned to what the door derives (`statesConditions`).
  const shapes = [undefined, [], ['due:daily'], ['substantive-change'], ['||'], ['', ' '], ['a || b'], ['due:weekly', 'repo-active']];
  for (const preconditions of shapes) {
    const decl = { id: 'x', expected_outcome: 'fresh_pr', ...(preconditions === undefined ? {} : { preconditions }) };
    const patched = stateTriggerText(`${JSON.stringify(decl, null, 2)}\n`);
    assert.equal(patched.trigger, normalizeTaskDeclaration(decl).trigger, JSON.stringify(preconditions));
  }
});

test('updateTaskSchedulingFields brings every local task.json up to the vocabulary, and reports each', async () => {
  const root = repo({
    [`${TASK}/task.json`]: '{\n  "id": "alpha",\n  "frequency": "daily",\n  "preconditions": ["none"]\n}\n',
    [`${LOCAL_PACK_ROOT}/mypack/tasks/beta/task.json`]: '{\n  "id": "beta",\n  "expected_outcome": "no_code_changes"\n}\n',
    [`${CANON_PACK_ROOT}/p/tasks/one/task.json`]: '{\n  "id": "one",\n  "frequency": "daily"\n}\n',
  });
  try {
    const io = checkoutIo(root);
    const applied = await updateTaskSchedulingFields(taskDirsWithJson([LOCAL_PACK_ROOT], io), io);
    // alpha needs both rewrites; beta only the trigger, which its shape reads as `request`.
    assert.equal(applied.length, 3);
    assert.match(applied[0], /alpha\/task\.json: frequency "daily" → "due:daily"/);
    assert.match(applied[1], /alpha\/task\.json: trigger "schedule" stated/);
    assert.match(applied[2], /beta\/task\.json: trigger "request" stated/);
    const alpha = JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8'));
    assert.deepEqual(alpha.preconditions, ['due:daily']);
    assert.equal(alpha.trigger, 'schedule');
    assert.equal(JSON.parse(readFileSync(join(root, LOCAL_PACK_ROOT, 'mypack/tasks/beta/task.json'), 'utf8')).trigger, 'request');
    assert.match(readFileSync(join(root, CANON_PACK_ROOT, 'p/tasks/one/task.json'), 'utf8'), /"frequency"/, 'the canon packs are the canon\'s');
    assert.deepEqual(await updateTaskSchedulingFields(taskDirsWithJson([LOCAL_PACK_ROOT], io), io), [], 'idempotent: nothing left to rewrite');
  } finally { removeTree(root); }
});

test('applyTaskSchedulingFields: gated on the flag, the probe and the io, and one runner with every other op', async () => {
  const root = repo({ [`${TASK}/task.json`]: '{\n  "id": "alpha",\n  "frequency": "weekly"\n}\n' });
  try {
    const io = { ...checkoutIo(root), move: () => {}, readTemplate: () => null };
    const record = { id: 'r', updateTaskSchedulingFields: true, appliesTo: async () => true };
    assert.deepEqual(await applyTaskSchedulingFields({ id: 'r' }, io), [], 'a record without the flag rewrites nothing');
    assert.deepEqual(await applyTaskSchedulingFields({ ...record, appliesTo: async () => false }, io), [], 'the probe gates it');
    const { listDir, ...classic } = io;
    assert.deepEqual(await applyTaskSchedulingFields(record, classic), [], 'an older caller without the listing rewrites nothing');
    const applied = await applyMigration(record, io);
    assert.equal(applied.length, 2, 'the field folded, then the trigger stated');
    const decl = JSON.parse(readFileSync(join(root, TASK, 'task.json'), 'utf8'));
    assert.deepEqual(decl.preconditions, ['due:weekly']);
    assert.equal(decl.trigger, 'schedule');
  } finally { removeTree(root); }
});

test('task-cadence-terms record: applies only where the mounted pack reads BOTH fields, in either root', async () => {
  const m = (await loadMigrations()).find((x) => x.id === 'task-cadence-terms');
  assert.ok(m, 'discovered');
  assert.equal(m.updateTaskSchedulingFields, true);
  // The two files the probe reads, each answering for one of the two rewrites.
  const capable = (p) => (p.endsWith('.json') ? '{ "properties": { "trigger": {} } }\n' : 'export const cadenceTermFor = (frequency) => …;\n');
  const inRoot = (root) => async (p) => (p.startsWith('.claudinite/shared/') === root ? capable(p) : null);
  assert.equal(await m.appliesTo(inRoot(true)), true, 'a member\'s mount');
  assert.equal(await m.appliesTo(inRoot(false)), true, 'the canon\'s own tree');
  assert.equal(await m.appliesTo(async () => 'export const FREQUENCIES = [];\n'), false, 'an older pack');
  // Each half alone is not enough: writing either field into a mount that does not
  // read it is what the probe exists to stop.
  assert.equal(await m.appliesTo(async (p) => (p.endsWith('.json') ? null : capable(p))), false, 'the cadence term without the schema');
  assert.equal(await m.appliesTo(async (p) => (p.endsWith('.json') ? capable(p) : null)), false, 'the schema without the cadence term');
  assert.equal(await m.appliesTo(async () => null), false, 'an unreadable mount is not capable');
  assert.equal(await m.legacyPresent(() => true, async () => 'x'), false);
  assert.equal(m.applyStage, undefined, 'a text rewrite needs no session');
});
