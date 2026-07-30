import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, normalizeManifest, PACK_FIELDS, RULE_SCOPES, MAX_ROUTING_WORDS } from '../../engine/pack_loader/pack-schema.mjs';
import { loadPacks } from '../../engine/pack_loader/pack-registry.mjs';

const rule = (id) => ({ id, severity: 'blocking', description: 'd', doc: 'x.md', why: 'w', run: () => [] });

const valid = {
  id: 'demo',
  ruleRoutingGuidance: {
    belongs: 'map rendering with the Leaflet library — tile layers, markers, CDN plugin pinning',
    excludes: 'generic HTML markup rules — that is html; dependency policy belongs to node',
  },
};

const whats = (mod, opts) => validateManifest(mod, opts).map((e) => e.what).join(' | ');

test('a manifest carrying the required fields validates', () => {
  assert.deepEqual(validateManifest(valid), []);
});

test('a missing required field is an error naming it', () => {
  const { ruleRoutingGuidance, ...without } = valid;
  assert.match(whats(without), /declares no "ruleRoutingGuidance"/);
  const { id, ...noId } = valid;
  assert.match(whats(noId), /declares no "id"/);
});

test('a non-object manifest is an error, not a throw', () => {
  assert.match(whats(null), /the manifest is not an object/);
  assert.match(whats('nope'), /the manifest is not an object/);
});

test('an undeclared field is an error — the vocabulary is closed', () => {
  assert.match(whats({ ...valid, skill: ['typo'] }), /declares "skill", which is not a pack manifest field/);
});

test('a declared field of the wrong type is an error', () => {
  assert.match(whats({ ...valid, requires: 'barriers' }), /"requires" is not a valid value/);
  assert.match(whats({ ...valid, detect: 'yes' }), /"detect" is not a valid value/);
  assert.match(whats({ ...valid, worldRules: [{ id: 'x' }] }), /"worldRules" is not a valid value/);
});

test('both routing sides are required and capped', () => {
  assert.match(whats({ ...valid, ruleRoutingGuidance: { belongs: 'a b c' } }), /ruleRoutingGuidance declares no "excludes"/);
  assert.match(whats({ ...valid, ruleRoutingGuidance: { belongs: '  ', excludes: 'x' } }), /ruleRoutingGuidance declares no "belongs"/);
  const over = Array.from({ length: MAX_ROUTING_WORDS + 2 }, (_, i) => `w${i}`).join(' ');
  assert.match(
    whats({ ...valid, ruleRoutingGuidance: { ...valid.ruleRoutingGuidance, belongs: over } }),
    new RegExp(`ruleRoutingGuidance\\.belongs is ${MAX_ROUTING_WORDS + 2} words, over the ${MAX_ROUTING_WORDS}-word cap`)
  );
});

test('a rule whose own scope contradicts its placement is drift', () => {
  const scoped = { ...rule('r'), scope: 'world' };
  assert.match(whats({ ...valid, workRules: [scoped] }), /the rule "r" declares scope "world" but sits in workRules/);
  // Agreeing, or staying silent and taking the stamp, are both fine.
  assert.deepEqual(validateManifest({ ...valid, workRules: [{ ...rule('r'), scope: 'work' }] }), []);
  assert.deepEqual(validateManifest({ ...valid, workRules: [rule('r')] }), []);
});

test('the skills declaration and the tree must agree in both directions', () => {
  assert.match(whats({ ...valid, skills: ['ghost'] }, { skillDirs: [] }), /declares a skill "ghost" with no skills\/ghost\/ directory/);
  assert.match(whats(valid, { skillDirs: ['orphan'] }), /bundles skills\/orphan\/ but does not declare it/);
  assert.deepEqual(validateManifest({ ...valid, skills: ['s'] }, { skillDirs: ['s'] }), []);
});

test('the label prefixes every error so the loader can name the pack', () => {
  const [first] = validateManifest({}, { label: 'the pack in packs/x' });
  assert.match(first.what, /^the pack in packs\/x: /);
});

test('normalizeManifest flattens the two scoped lists and stamps each rule', () => {
  const flat = normalizeManifest({ ...valid, worldRules: [rule('a')], workRules: [rule('b')] });
  assert.deepEqual(flat.rules.map((r) => [r.id, r.scope]), [['a', 'world'], ['b', 'work']]);
  assert.deepEqual(normalizeManifest(valid).rules, []);
});

test('the scope vocabulary is exactly the two manifest lists', () => {
  assert.deepEqual(RULE_SCOPES, { worldRules: 'world', workRules: 'work' });
  for (const key of Object.keys(RULE_SCOPES)) assert.ok(PACK_FIELDS[key], `${key} is not in the spec`);
});

test('real corpus: every pack satisfies the spec it is loaded through', async () => {
  const errors = [];
  const packs = await loadPacks({ localRoot: process.cwd(), onError: (e) => errors.push(e) });
  assert.ok(packs.length > 0, 'no packs discovered');
  assert.deepEqual(errors.map((e) => e.what), []);
});

// The one drift risk of having an authoring schema AND an in-memory contract: the
// two vocabularies must name the same fields, or a field added to pack.schema.json
// is accepted by the editor and then rejected at load as "not a pack manifest
// field". `$schema` and `helpers` are authoring-only and stripped before the
// resolved manifest reaches PACK_FIELDS, so they are the declared exceptions.
test('PACK_FIELDS and pack.schema.json name the same manifest fields', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(
    readFileSync(new URL('../../engine/pack_loader/pack.schema.json', import.meta.url), 'utf8')
  );
  const AUTHORING_ONLY = ['$schema', 'helpers'];
  assert.deepEqual(
    Object.keys(schema.properties).filter((k) => !AUTHORING_ONLY.includes(k)).sort(),
    Object.keys(PACK_FIELDS).sort(),
    'the JSON schema and the resolved-manifest contract have drifted — add the field to both, or to AUTHORING_ONLY'
  );
  for (const key of AUTHORING_ONLY) {
    assert.ok(schema.properties[key], `${key} must be declared in the schema`);
    assert.equal(PACK_FIELDS[key], undefined, `${key} is authoring-only and must not reach the resolved manifest`);
  }
  assert.deepEqual(
    schema.required.sort(),
    Object.entries(PACK_FIELDS).filter(([, f]) => f.required).map(([k]) => k).sort(),
    'the two must also agree on which fields are required'
  );
});
