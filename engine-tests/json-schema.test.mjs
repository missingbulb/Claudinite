import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { validate } from '../engine/checks/helpers/json-schema.mjs';

const messages = (doc, schema) => validate(doc, schema).map((e) => `${e.path}: ${e.message}`);

test('json-schema: type, required, enum, const and a closed key set', () => {
  const schema = {
    type: 'object',
    required: ['id', 'kind'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 },
      kind: { enum: ['a', 'b'] },
      n: { type: 'integer', minimum: 0, maximum: 10 },
      fixed: { const: 'yes' },
    },
  };
  assert.deepEqual(messages({ id: 'x', kind: 'a', n: 3, fixed: 'yes' }, schema), []);
  assert.deepEqual(messages({ id: '', kind: 'c', n: 2.5, fixed: 'no', extra: 1 }, schema), [
    '/id: shorter than 1 characters',
    '/kind: "c" is not one of "a", "b"',
    '/n: expected integer, got number 2.5',
    '/fixed: "no" is not the required "yes"',
    ': the property "extra" is not allowed',
  ]);
  assert.deepEqual(messages({ id: 'x' }, schema), [': missing the required property "kind"']);
  assert.deepEqual(messages('not an object', schema), [': expected object, got string "not an object"']);
});

test('json-schema: arrays, strings and numbers', () => {
  const schema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string', pattern: '^[a-z-]+$' }, minItems: 1, maxItems: 2, uniqueItems: true },
      name: { type: 'string', maxLength: 3 },
      ratio: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.25 },
      nullable: { type: ['string', 'null'] },
    },
  };
  assert.deepEqual(messages({ tags: ['ok'], name: 'abc', ratio: 0.5, nullable: null }, schema), []);
  assert.deepEqual(messages({ tags: ['Bad', 'Bad'], name: 'abcd', ratio: 1, nullable: 3 }, schema), [
    '/tags: items are not unique',
    '/tags/0: "Bad" does not match /^[a-z-]+$/',
    '/tags/1: "Bad" does not match /^[a-z-]+$/',
    '/name: longer than 3 characters',
    '/ratio: 1 is not below 1',
    '/nullable: expected string or null, got number 3',
  ]);
  assert.deepEqual(messages({ tags: [] }, schema), ['/tags: fewer than 1 items']);
});

test('json-schema: $ref into $defs, oneOf/anyOf/allOf/not, if/then/else, patternProperties', () => {
  const schema = {
    $defs: { name: { type: 'string', minLength: 2 } },
    type: 'object',
    properties: {
      who: { $ref: '#/$defs/name' },
      mode: { oneOf: [{ const: 'x' }, { const: 'y' }] },
      any: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      all: { allOf: [{ type: 'string' }, { minLength: 2 }] },
      never: { not: { const: 'forbidden' } },
      guarded: { type: 'object', properties: { on: { type: 'boolean' } }, if: { properties: { on: { const: true } }, required: ['on'] }, then: { required: ['value'] }, else: { properties: { value: false } } },
    },
    patternProperties: { '^x-': { type: 'number' } },
  };
  assert.deepEqual(messages({ who: 'ab', mode: 'x', any: 1, all: 'ab', never: 'fine', guarded: { on: true, value: 1 }, 'x-custom': 2 }, schema), []);
  assert.deepEqual(messages({ who: 'a', mode: 'z', any: true, all: 'a', never: 'forbidden', guarded: { on: false, value: 1 }, 'x-custom': 'no' }, schema), [
    '/who: shorter than 2 characters',
    '/mode: must match exactly one of the oneOf alternatives',
    '/any: matches none of the anyOf alternatives',
    '/all: shorter than 2 characters',
    '/never: matches a schema it must not',
    '/guarded/value: no value is allowed here',
    '/x-custom: expected number, got string "no"',
  ]);
  assert.throws(() => validate({}, { $ref: '#/$defs/missing' }), /points at nothing/);
  assert.throws(() => validate({}, { $ref: 'https://example.com/s.json' }), /local JSON pointer/);
});

test('json-schema: annotation and unknown keywords are ignored', () => {
  assert.deepEqual(messages({ a: 1 }, { title: 't', description: 'd', default: {}, examples: [], $comment: 'c', 'x-vendor': true, properties: { a: { description: 'n' } } }), []);
});

// The tree's own documents against the schemas they point at: every `$schema`
// that is a repo-relative path resolves, and the document satisfies it.
test('json-schema: every $schema-pointed document in this tree validates against its schema', () => {
  const root = join(import.meta.dirname, '..');
  const files = execSync('git ls-files "*.json"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  let checked = 0;
  for (const file of files) {
    let doc;
    try { doc = JSON.parse(readFileSync(join(root, file), 'utf8')); } catch { continue; }
    if (!doc || typeof doc.$schema !== 'string' || /^https?:/.test(doc.$schema)) continue;
    const schemaPath = normalize(join(dirname(file), doc.$schema));
    const schema = JSON.parse(readFileSync(join(root, schemaPath), 'utf8'));
    assert.deepEqual(validate(doc, schema), [], `${file} against ${schemaPath}`);
    checked += 1;
  }
  assert.ok(checked > 0, 'the tree carries $schema-pointed documents for this test to read');
});
