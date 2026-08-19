import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../packs/claudinite-fleet-sheepdog/seeds-agree.mjs';
import { parseSheepdogConfig } from '../../packs/claudinite-fleet-sheepdog/fleet-config.mjs';

// See-it-fail proof for fleet-pack-seed-agrees. The violating fixture is a seed the
// pack-seed sweep would write into every member while this repo runs something else —
// demonstrated against the sweep's own config reader, so the test cannot agree with a
// check that has drifted from what the fleet is actually given.
//
// Every fixture uses a made-up pack id: the rule names no pack, and a test that reached
// for a real one would quietly become a test of that pack.
const PACK = 'some-pack';

// The two views a rule gets of one settings file: the raw text (what the sweep reads,
// through parseSheepdogConfig) and the engine's normalized config (what a session here
// runs). Built from one literal so they can never disagree by accident.
function ctx({ seed, own, declared = true }) {
  const packs = [
    { id: 'claudinite-fleet-sheepdog', config: { owner: 'missingbulb', packSeeds: seed === undefined ? [] : [{ id: PACK, ...(seed === null ? {} : { config: seed }) }] } },
    ...(declared ? [{ id: PACK, ...(own === undefined ? {} : { config: own }) }] : []),
  ];
  const text = JSON.stringify({ packs }, null, 2);
  return {
    read: (p) => (p === '.claudinite-checks.json' ? text : null),
    config: {
      packs: packs.map((e) => e.id),
      packConfig: Object.fromEntries(packs.filter((e) => e.config !== undefined).map((e) => [e.id, e.config])),
    },
  };
}

test('a seed disagreeing with what this repo runs is found — and really is what the fleet would be given', () => {
  const c = ctx({ own: { repo: 'missingbulb/Shepherd' }, seed: { repo: 'missingbulb/Claudinite' } });
  const found = rule.run(c);
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'fleet-pack-seed-agrees');
  assert.equal(found[0].severity, 'blocking');
  assert.match(found[0].what, /missingbulb\/Claudinite/);
  assert.match(found[0].what, /missingbulb\/Shepherd/);
  assert.ok(found[0].line > 0, 'points at a line');
  // the defect the finding claims, demonstrated against the real sweep's config reader
  const { packSeeds } = parseSheepdogConfig(JSON.parse(c.read('.claudinite-checks.json')), 'missingbulb/Shepherd');
  assert.deepEqual(packSeeds.find((s) => s.id === PACK).config, { repo: 'missingbulb/Claudinite' });
});

test('any difference counts — the config is compared whole, not by a key this pack knows', () => {
  assert.equal(rule.run(ctx({ own: { repo: 'o/n' }, seed: { repo: 'o/n', path: 'people' } })).length, 1, 'an extra key');
  assert.equal(rule.run(ctx({ own: { repo: 'o/n', dirs: ['a'] }, seed: { repo: 'o/n', dirs: ['b'] } })).length, 1, 'a nested value');
  assert.equal(rule.run(ctx({ own: { repo: 'o/n' }, seed: { repo: 'O/N' } })).length, 1,
    'no per-pack normalization — this check may not know that one pack\'s value is case-insensitive');
});

test('a one-sided config is a disagreement in both directions', () => {
  const seedOnly = rule.run(ctx({ own: undefined, seed: { repo: 'o/n' } }));
  assert.equal(seedOnly.length, 1, 'the fleet is handed a config this repo does not carry');
  assert.match(seedOnly[0].what, /null/);
  assert.equal(rule.run(ctx({ own: { repo: 'o/n' }, seed: null })).length, 1,
    'the fleet is handed a bare declaration while this repo runs a configured one');
});

test('agreement is clean, whatever the config is', () => {
  assert.deepEqual(rule.run(ctx({ own: { repo: 'o/n' }, seed: { repo: 'o/n' } })), []);
  assert.deepEqual(rule.run(ctx({ own: { repo: 'o/n', path: 'people' }, seed: { path: 'people', repo: 'o/n' } })), [],
    'key order is not a disagreement');
  assert.deepEqual(rule.run(ctx({ own: undefined, seed: null })), [],
    'neither side carries a config — nothing to disagree about');
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run({ read: () => null, config: {} }), [], 'no settings file');
  assert.deepEqual(rule.run({ read: () => '{ not json', config: {} }), []);
  assert.deepEqual(
    rule.run({ read: () => JSON.stringify({ packs: [{ id: PACK, config: { repo: 'o/n' } }] }), config: { packs: [PACK], packConfig: { [PACK]: { repo: 'o/n' } } } }),
    [], 'no claudinite-fleet-sheepdog config — not an enforcer, so there are no seeds');
  assert.deepEqual(rule.run(ctx({ own: undefined, seed: undefined })), [],
    'an enforcer whose fleet seeds nothing');
  assert.deepEqual(rule.run(ctx({ seed: { repo: 'o/n' }, declared: false })), [],
    'a pack this fleet standardizes on but does not itself run');
});
