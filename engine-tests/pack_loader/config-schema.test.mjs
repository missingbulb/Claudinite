import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, normalizeManifest } from '../../engine/pack_loader/pack-schema.mjs';

// The manifest seam that retires a pack's hand-rolled config validator: the pack
// states the SHAPE of its own entry config, and the engine mints the rule that
// reports a member's mistake.
const base = {
  id: 'demo',
  ruleRoutingGuidance: { belongs: 'a b c', excludes: 'd e f' },
};

const schema = {
  ruleId: 'demo-config',
  severity: 'blocking',
  why: 'a malformed entry silently changes what the pack does, with nothing else to say so',
  fix: 'set { "id": "demo", "config": { "retention_days": 10 } }',
  properties: {
    retention_days: { type: 'positiveInteger' },
    promote: { type: 'boolean' },
    pack_paths: { type: 'nonEmptyStringArray' },
  },
};

const ruleOf = (mod) => normalizeManifest(mod).rules.find((r) => r.id === 'demo-config');
const findings = (configSchema, config) =>
  ruleOf({ ...base, configSchema }).run({ config: { packConfig: { demo: config } } });

test('a pack declaring configSchema gets its rule, scoped to the world and carrying the declared metadata', () => {
  const rule = ruleOf({ ...base, configSchema: schema });
  assert.equal(rule.scope, 'world');
  assert.equal(rule.severity, 'blocking');
  assert.equal(rule.why, schema.why);
});

test('an absent, empty or valid config says nothing', () => {
  for (const config of [undefined, null, {}, { retention_days: 10 }, { retention_days: 10, promote: false },
    { pack_paths: ['.claudinite/local/packs', 'packs'] }]) {
    assert.deepEqual(findings(schema, config), [], JSON.stringify(config));
  }
});

test('each declared type is enforced, and the finding quotes what it found', () => {
  for (const [config, pattern] of [
    [{ retention_days: '10' }, /"retention_days"/],
    [{ retention_days: 0 }, /"retention_days"/],
    [{ promote: 'yes' }, /"promote"/],
    [{ pack_paths: [] }, /"pack_paths"/],
    [{ pack_paths: 'one' }, /"pack_paths"/],
    [{ pack_paths: ['ok', ''] }, /"pack_paths"/],
  ]) {
    const out = findings(schema, config);
    assert.equal(out.length, 1, JSON.stringify(config));
    assert.match(out[0].what, pattern);
    assert.equal(out[0].file, '.claudinite-checks.json');
  }
});

test('a config that is not an object, and an unknown property, are each reported once', () => {
  assert.match(findings(schema, [])[0].what, /must be an object/);
  const [unknown] = findings(schema, { retention_days: 10, surprise: true });
  assert.match(unknown.what, /unknown property "surprise"/);
  assert.match(unknown.what, /retention_days/, 'the finding names the vocabulary it does know');
});

test('a schema declaring no properties says the pack takes no config at all', () => {
  const takesNone = { ruleId: 'demo-config', severity: 'blocking', why: 'w', fix: 'remove the config object', properties: {} };
  assert.deepEqual(findings(takesNone, undefined), []);
  assert.match(findings(takesNone, {})[0].what, /takes no config/);
  assert.match(findings(takesNone, { anything: 1 })[0].what, /takes no config/);
});

test('a required property is reported when the config omits it, and every problem is reported', () => {
  const required = { ...schema, properties: { repo: { type: 'string', matching: /^[^/\s]+\/[^/\s]+$/ } }, required: ['repo'] };
  assert.deepEqual(findings(required, { repo: 'owner/name' }), []);
  assert.match(findings(required, {})[0].what, /names no "repo"/);
  assert.match(findings(required, { repo: 'ownername' })[0].what, /"repo"/);
  assert.equal(findings(required, { repo: 1, surprise: true }).length, 2);
});

test('a malformed schema is a manifest authoring error, naming the vocabulary', () => {
  const errs = (configSchema) => validateManifest({ ...base, configSchema }).map((e) => `${e.what} ${e.fix}`).join(' ');
  assert.deepEqual(validateManifest({ ...base, configSchema: schema }), []);
  assert.match(errs({ ...schema, properties: { x: { type: 'wat' } } }), /positiveInteger/);
  assert.match(errs({ ...schema, ruleId: '' }), /configSchema/);
  assert.match(errs({ ...schema, severity: 'loud' }), /configSchema/);
  assert.match(errs({ ...schema, required: ['nope'] }), /nope/);
  assert.match(errs({ ...schema, surprise: true }), /configSchema/);
});
