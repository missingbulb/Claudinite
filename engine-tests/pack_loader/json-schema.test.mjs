// The subset validator, and the audit that keeps it honest about pack.schema.json.
//
// A hand-rolled schema validator's real failure mode is not a wrong verdict — it
// is a SILENT one: a keyword it does not implement looks enforced in the schema
// and enforces nothing. So the load-bearing test here is not any single case
// below; it is `unsupportedKeywords` over the live pack.schema.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, unsupportedKeywords } from '../../engine/pack_loader/json-schema.mjs';

const PACK_SCHEMA = JSON.parse(
  readFileSync(new URL('../../engine/pack_loader/pack.schema.json', import.meta.url), 'utf8')
);

const paths = (errors) => errors.map((e) => e.path);
const messages = (errors) => errors.map((e) => `${e.path} ${e.message}`).join(' | ');

test('every keyword pack.schema.json uses is one this validator implements', () => {
  assert.deepEqual(
    unsupportedKeywords(PACK_SCHEMA), [],
    'the schema uses a keyword the validator ignores — implement it in json-schema.mjs, or the schema is decoration'
  );
});

test('a schema keyword the validator does not implement is reported as a schema fault, never skipped', () => {
  const errors = validate('x', { type: 'string', oneOf: [{ type: 'string' }] });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].schemaFault);
  assert.match(errors[0].message, /"oneOf", which this validator does not implement/);
});

test('type: the failing value is named with the type it is and the types it may be', () => {
  assert.deepEqual(validate('x', { type: 'string' }), []);
  const [e] = validate(3, { type: ['string', 'null'] });
  assert.equal(e.path, '');
  assert.match(e.message, /is integer, not "string" or "null"/);
  assert.deepEqual(validate(null, { type: ['string', 'null'] }), []);
  assert.deepEqual(validate(2, { type: 'integer' }), []);
  assert.equal(validate(2.5, { type: 'integer' }).length, 1);
});

test('required names the MISSING property, not the object', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', description: 'the pack id' } },
  };
  const [e] = validate({}, schema);
  assert.equal(e.path, 'id');
  assert.equal(e.message, 'is required');
  assert.equal(e.description, 'the pack id', 'the fix comes from the missing property\'s own description');
});

test('additionalProperties: false closes the vocabulary and lists what is allowed', () => {
  const schema = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, prose: { type: 'string' } } };
  const [e] = validate({ id: 'x', skill: [] }, schema);
  assert.equal(e.path, 'skill');
  assert.match(e.message, /is not a known field — the known fields are: id, prose/);
});

test('nested paths read as the author wrote the file', () => {
  const schema = {
    type: 'object',
    properties: {
      worldRules: { type: 'array', items: { type: 'string' } },
      contributes: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
      routing: { type: 'object', properties: { belongs: { type: 'string' } } },
    },
  };
  const errors = validate({ worldRules: ['a', 2], contributes: { barriers: [3] }, routing: { belongs: 4 } }, schema);
  assert.deepEqual(paths(errors), ['worldRules[1]', 'contributes.barriers[0]', 'routing.belongs']);
});

test('pattern, minLength, minItems, minProperties and minimum each report readably', () => {
  assert.match(messages(validate('Pack.MJS', { type: 'string', pattern: '^[a-z.]+$' })), /does not match \^/);
  assert.match(messages(validate('', { type: 'string', minLength: 1 })), /is empty/);
  assert.match(messages(validate([], { type: 'array', minItems: 1 })), /is empty/);
  assert.match(messages(validate({}, { type: 'object', minProperties: 1 })), /declares nothing/);
  assert.match(messages(validate(0, { type: 'integer', minimum: 1 })), /below the minimum of 1/);
});

// The union messages are where a generic validator usually gets unhelpful, so
// both halves of the rule are pinned.
test('anyOf: a value that matches no branch at all gets ONE error at the union', () => {
  const schema = {
    description: 'null, a filename, or a tracked-path spec',
    anyOf: [{ type: 'null' }, { type: 'string' }, { type: 'object' }],
  };
  const errors = validate(42, schema);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'does not match any allowed form');
  assert.equal(errors[0].description, 'null, a filename, or a tracked-path spec');
});

test('anyOf: a value that clearly MEANT one branch gets that branch\'s errors instead', () => {
  const schema = {
    anyOf: [
      { type: 'string' },
      { type: 'object', required: ['label', 'probe'], properties: { label: { type: 'string' }, probe: { type: 'string' } } },
    ],
  };
  const errors = validate({ label: 'Flutter SDK' }, schema);
  assert.deepEqual(paths(errors), ['probe']);
  assert.equal(errors[0].message, 'is required');
});

test('$ref resolves into $defs, and a use-site description wins over the definition\'s', () => {
  const schema = {
    $defs: { name: { type: 'string', description: 'a bare filename' } },
    type: 'object',
    properties: {
      detect: { $ref: '#/$defs/name', description: 'the detect module filename' },
      env: { $ref: '#/$defs/name' },
    },
  };
  const [detect, env] = validate({ detect: 1, env: 2 }, schema);
  assert.equal(detect.description, 'the detect module filename');
  assert.equal(env.description, 'a bare filename');
});

test('an unresolvable $ref is a schema fault, not a pass', () => {
  const [e] = validate('x', { $ref: '#/$defs/ghost' });
  assert.ok(e.schemaFault);
  assert.match(e.message, /does not resolve/);
});

test('a real canon manifest validates, and one bad field is the only complaint', () => {
  const manifest = {
    $schema: '../../engine/pack_loader/pack.schema.json',
    id: 'demo',
    ruleRoutingGuidance: { belongs: 'demo things', excludes: 'everything else — some other pack' },
    badge: 'badge.svg',
    marker: null,
    detect: { trackedPath: { basename: 'demo.json', maxDepth: 2 } },
    prose: 'RULES.md',
    worldRules: ['a-rule.mjs'],
  };
  assert.deepEqual(validate(manifest, PACK_SCHEMA), []);
  assert.deepEqual(
    paths(validate({ ...manifest, worldRules: ['A_Rule.MJS'] }, PACK_SCHEMA)),
    ['worldRules[0]']
  );
});
