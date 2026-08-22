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

test('a non-object default export is an error, not a throw', () => {
  assert.match(whats(null), /has no object default export/);
  assert.match(whats('nope'), /has no object default export/);
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

test('the version fields are optional, and validated for shape when declared', () => {
  // Optional: a member's local packs carry neither, and the loader must keep
  // accepting them (docs/versioned-updates/DESIGN.md §8).
  assert.deepEqual(validateManifest(valid), []);
  assert.deepEqual(validateManifest({ ...valid, version: 3, minEngineVersion: 2 }), []);
  for (const bad of ['1', 1.5, 0, -1, null]) {
    assert.match(whats({ ...valid, version: bad }), /"version" is not a valid value/, `version: ${bad}`);
    assert.match(whats({ ...valid, minEngineVersion: bad }), /"minEngineVersion" is not a valid value/, `minEngineVersion: ${bad}`);
  }
});

test('a declared skill with no directory behind it is a manifest that lies', () => {
  assert.match(whats({ ...valid, skills: ['ghost'] }, { skillDirs: [] }), /declares a skill "ghost" with no skills\/ghost\/ directory/);
  assert.deepEqual(validateManifest({ ...valid, skills: ['s'] }, { skillDirs: ['s'] }), []);
  // The other direction is not a fault: the convention lists every skills/<name>/,
  // so a name missing from an explicit list is a deliberate withholding.
  assert.deepEqual(validateManifest(valid, { skillDirs: ['orphan'] }), []);
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

// A handover step that carries only a sentence is a note someone has to interpret; it
// needs `breaks` to judge urgency and `done` to ever close the tracking issue. The
// shape is the rule for handing over human-only work, so half of it is not valid.
test('adoptionHandover requires all three parts of a step', () => {
  const base = { id: 'p', ruleRoutingGuidance: { belongs: 'a', excludes: 'b' } };
  const ok = validateManifest({ ...base, adoptionHandover: [{ step: 'Flip it', breaks: 'nothing works', done: 'it is on' }] });
  assert.deepEqual(ok, []);

  for (const bad of [
    [{ step: 'Flip it' }],
    [{ step: 'Flip it', breaks: 'x' }],
    [{ step: 'Flip it', breaks: 'x', done: '   ' }],
    [{ breaks: 'x', done: 'y' }],
    'not an array',
  ]) {
    assert.ok(validateManifest({ ...base, adoptionHandover: bad }).length > 0,
      `expected a rejection for ${JSON.stringify(bad)}`);
  }
});
