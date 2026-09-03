import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { FREQUENCIES } from '../calendar.mjs';
import { MODEL_FAMILIES } from '../model-map.mjs';
import { OUTCOMES, INTERRUPT_POLICIES, SESSION_SCOPES, validateTaskDeclaration, normalizeTaskDeclaration } from '../task-contract.mjs';
import { loadTaskTerms } from '../task-terms.mjs';
import { parseTaskDeclaration, findTaskDeclaration, loadTaskDeclaration, siblingTaskDeclaration } from '../task-declaration.mjs';

const root = join(import.meta.dirname, '../../..');
const schema = JSON.parse(readFileSync(join(root, 'packs/claudinite-tasks/task.schema.json'), 'utf8'));

// The schema is what an editor validates against; the contract is what the engine
// validates against. Neither generates the other, so the enums are pinned equal.
test('task.schema.json: its enums are the contract\'s lists', () => {
  const p = schema.properties;
  assert.deepEqual(p.frequency.enum, FREQUENCIES);
  assert.deepEqual(p.agent_model.enum, MODEL_FAMILIES);
  assert.deepEqual(p.expected_outcome.enum, OUTCOMES);
  assert.deepEqual(p.on_interrupt.enum, INTERRUPT_POLICIES);
  assert.deepEqual(p.session_scope.enum, SESSION_SCOPES);
  assert.deepEqual(schema.required, ['id', 'description', 'frequency', 'preconditions', 'expected_outcome']);
  assert.equal(schema.properties.description.maxWords, undefined, 'JSON Schema has no word bound — the contract holds it');
  assert.equal(schema.additionalProperties, false);
});

// A subset validator — enough to hold every canon declaration to the schema's
// property set and types without a dependency for the job.
function violations(decl) {
  const out = [];
  for (const key of schema.required) if (decl[key] === undefined) out.push(`missing ${key}`);
  for (const [key, value] of Object.entries(decl)) {
    const spec = schema.properties[key];
    if (!spec) { out.push(`unknown ${key}`); continue; }
    const types = spec.oneOf ? spec.oneOf.map((o) => o.type) : [spec.type];
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (spec.const !== undefined) { if (value !== spec.const) out.push(`${key} !== ${spec.const}`); continue; }
    if (!types.includes(actual) && !(spec.type === 'integer' && Number.isInteger(value))) out.push(`${key}: ${actual}`);
    const enumOf = spec.enum ?? spec.oneOf?.find((o) => o.enum)?.enum;
    if (enumOf && typeof value === 'string' && !enumOf.includes(value)) out.push(`${key}: "${value}" not in enum`);
  }
  if (decl.expected_outcome === 'pr' && decl.automerge === undefined) out.push('pr without automerge');
  return out;
}

test('every canon task.json satisfies the schema, points at it, and validates against the contract', async () => {
  const files = execSync('git ls-files "packs/*/tasks/*/task.json" "packs/*/queue/tasks/*/task.json"', { cwd: root }).toString().trim().split('\n');
  assert.ok(files.length >= 25, `found ${files.length}`);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(root, f), 'utf8'));
    assert.deepEqual(violations(raw), [], f);
    const pointer = join(root, f, '..', raw.$schema);
    assert.equal(pointer, join(root, 'packs/claudinite-tasks/task.schema.json'), `${f}: $schema resolves to the schema`);
    const dir = join(root, f, '..');
    assert.equal(findTaskDeclaration(dir), join(dir, 'task.json'));
    const decl = normalizeTaskDeclaration(await loadTaskDeclaration(join(dir, 'task.json')));
    assert.deepEqual(validateTaskDeclaration(decl, await loadTaskTerms(dir)), [], f);
  }
});

test('parseTaskDeclaration strips $schema and leaves a non-object as it is', () => {
  assert.deepEqual(parseTaskDeclaration('{ "$schema": "x", "id": "a" }'), { id: 'a' });
  assert.equal(parseTaskDeclaration('42'), 42);
});

test('siblingTaskDeclaration: json over mjs, both is an error state, neither is absent', () => {
  const at = (present) => (p) => present.includes(p);
  assert.deepEqual(siblingTaskDeclaration('packs/p/tasks/t/task.md', at(['packs/p/tasks/t/task.json'])), { file: 'packs/p/tasks/t/task.json', both: false });
  assert.deepEqual(siblingTaskDeclaration('packs/p/tasks/t/task.md', at(['packs/p/tasks/t/task.mjs'])), { file: 'packs/p/tasks/t/task.mjs', both: false });
  assert.deepEqual(siblingTaskDeclaration('packs/p/tasks/t/task.md', at(['packs/p/tasks/t/task.mjs', 'packs/p/tasks/t/task.json'])), { file: null, both: true });
  assert.deepEqual(siblingTaskDeclaration('packs/p/tasks/t/task.md', at([])), { file: null, both: false });
});
