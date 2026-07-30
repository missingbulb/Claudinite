// Reading a `pack.json`: resolving the filenames it names into modules, and the
// two guards the filename shape buys — nothing in the pack root is invisible, and
// nothing is named twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPackJson } from '../../engine/pack_loader/pack-json.mjs';
import { loadPacks } from '../../engine/pack_loader/pack-registry.mjs';

const CANON_ROOT = new URL('../..', import.meta.url).pathname;

// A fixture pack directory. `manifest` is written as pack.json; `files` are its
// siblings. Nothing here points `$schema` anywhere — that field is optional, and
// the pointer guard has its own test below.
function packDir(manifest, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-pack-'));
  writeFileSync(join(dir, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const RULE = (id) => `export default { id: '${id}', severity: 'advisory', description: 'd', doc: 'x.md', why: 'w', run: () => [] };\n`;

const BASE = {
  id: 'demo',
  ruleRoutingGuidance: { belongs: 'demo things', excludes: 'everything else — another pack' },
};

async function load(manifest, files) {
  const dir = packDir(manifest, files);
  try {
    return await loadPackJson(dir, { label: 'the pack in packs/demo' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const whats = (errors) => errors.map((e) => e.what).join(' | ');

test('rule filenames resolve to the rule objects, in their declared order and scope lists', async () => {
  const { manifest, errors } = await load(
    { ...BASE, worldRules: ['a.mjs', 'b.mjs'], workRules: ['c.mjs'] },
    { 'a.mjs': RULE('a'), 'b.mjs': RULE('b'), 'c.mjs': RULE('c') }
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(manifest.worldRules.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(manifest.workRules.map((r) => r.id), ['c']);
});

test('the authoring-only fields never reach the engine', async () => {
  const { manifest } = await load(
    { $schema: 'nowhere/pack.schema.json', ...BASE, helpers: ['lib.mjs'] },
    { 'lib.mjs': 'export default 1;\n' }
  );
  assert.equal('$schema' in manifest, false);
  assert.equal('helpers' in manifest, false);
});

test('a declared rule module that is missing, broken, or not a rule is reported and dropped — the pack still loads', async () => {
  const { manifest, errors } = await load(
    { ...BASE, worldRules: ['gone.mjs', 'broken.mjs', 'nodefault.mjs', 'notarule.mjs', 'good.mjs'] },
    {
      'broken.mjs': 'this is not( valid javascript\n',
      'nodefault.mjs': 'export const x = 1;\n',
      'notarule.mjs': 'export default { id: "x" };\n', // no run()
      'good.mjs': RULE('good'),
    }
  );
  assert.deepEqual(manifest.worldRules.map((r) => r.id), ['good'], 'the loadable rule still runs');
  assert.match(whats(errors), /names gone\.mjs, which the pack directory does not carry/);
  assert.match(whats(errors), /broken\.mjs failed to load/);
  assert.match(whats(errors), /names nodefault\.mjs, which has no default export/);
  assert.match(whats(errors), /names notarule\.mjs, which does not default-export a rule/);
});

// THE guard the module shape could not have.
test('a rule module the manifest declares nowhere is an error, not an invisible file', async () => {
  const { errors } = await load(
    { ...BASE, worldRules: ['declared.mjs'] },
    { 'declared.mjs': RULE('declared'), 'forgotten.mjs': RULE('forgotten') }
  );
  assert.match(whats(errors), /carries forgotten\.mjs but declares it nowhere/);
  assert.equal(errors.length, 1, 'only the undeclared module is a fault');
});

test('every field that names a module accounts for it — detect, env, contributedRules, contributes, helpers', async () => {
  const { manifest, errors } = await load(
    {
      ...BASE,
      detect: 'detect.mjs',
      env: 'env.mjs',
      contributedRules: 'contributed.mjs',
      contributes: { barriers: ['wall.mjs'] },
      helpers: ['lib.mjs'],
    },
    {
      'detect.mjs': 'export default (ctx) => ctx.tracked.includes("x");\n',
      'env.mjs': 'export default { label: "L", setup: () => "s", probe: () => "p" };\n',
      'contributed.mjs': 'export default (packs) => packs;\n',
      'wall.mjs': 'export default { id: "wall", edges: [] };\n',
      'lib.mjs': 'export default 1;\n',
    }
  );
  assert.deepEqual(errors, []);
  assert.equal(manifest.detect({ tracked: ['x'] }), true);
  assert.equal(manifest.env.label, 'L');
  assert.equal(typeof manifest.contributedRules, 'function');
  assert.deepEqual(manifest.contributes.barriers, [{ id: 'wall', edges: [] }]);
});

test('a co-located test file is not pack content the manifest has to declare', async () => {
  const { errors } = await load(
    { ...BASE, worldRules: ['r.mjs'] },
    { 'r.mjs': RULE('r'), 'r.test.mjs': 'import test from "node:test";\n' }
  );
  assert.deepEqual(errors, []);
});

test('a module named twice is an error — a rule belongs to exactly one scope', async () => {
  const { errors } = await load(
    { ...BASE, worldRules: ['r.mjs'], workRules: ['r.mjs'] },
    { 'r.mjs': RULE('r') }
  );
  assert.match(whats(errors), /declares r\.mjs under worldRules and workRules/);
});

test('an inline env block joins a line list into one shell fragment', async () => {
  const { manifest, errors } = await load({
    ...BASE,
    env: { label: 'Some SDK', setup: ['line one', 'line two'], probe: 'command -v thing' },
  });
  assert.deepEqual(errors, []);
  assert.equal(manifest.env.setup, 'line one\nline two');
  assert.equal(manifest.env.probe, 'command -v thing');
});

test('a declarative detect compiles; a detect.mjs that does not export a function is reported and made inert', async () => {
  const { manifest: data } = await load({ ...BASE, detect: { trackedPath: { is: 'marker' } } });
  assert.equal(data.detect({ tracked: ['marker'] }), true);

  const { manifest, errors } = await load(
    { ...BASE, detect: 'detect.mjs' },
    { 'detect.mjs': 'export default 42;\n' }
  );
  assert.equal(manifest.detect, null, 'an unusable predicate must not be called');
  assert.match(whats(errors), /does not default-export a function/);
});

test('a field the schema does not know is an error; unparseable JSON yields no manifest at all', async () => {
  const { errors } = await load({ ...BASE, skill: ['typo'] });
  assert.match(whats(errors), /"skill" is not a known field/);

  const dir = mkdtempSync(join(tmpdir(), 'claudinite-pack-'));
  try {
    writeFileSync(join(dir, 'pack.json'), '{ "id": "demo",\n');
    const { manifest, errors: parseErrors } = await loadPackJson(dir, { label: 'the pack in packs/demo' });
    assert.equal(manifest, null);
    assert.match(whats(parseErrors), /pack\.json could not be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every message is prefixed with the pack it is about', async () => {
  const { errors } = await load({ ...BASE, worldRules: ['gone.mjs'] });
  assert.ok(errors.every((e) => e.what.startsWith('the pack in packs/demo: ')));
});

// `$schema` is what makes a hand-edited manifest validate in an editor, and a
// wrong relative depth breaks that silently — the file still loads.
test('a $schema pointer that resolves to no schema is reported; a correct one is silent', async () => {
  const canonPack = join(CANON_ROOT, 'packs', 'basics');
  const { errors } = await loadPackJson(canonPack, { label: 'the pack in packs/basics' });
  assert.deepEqual(errors, [], 'a real canon pack points at the real schema');

  const { errors: wrong } = await load({ $schema: '../engine/pack_loader/pack.schema.json', ...BASE });
  assert.match(whats(wrong), /"\$schema" points at .*, where this tree has no pack\.schema\.json/);
});

// The corpus itself is the largest fixture there is, and the guards above are
// only worth having if they are actually satisfied by every pack that ships.
test('the real corpus: every pack manifest loads with no faults at all', async () => {
  const packs = await loadPacks({ localRoot: CANON_ROOT });
  assert.ok(packs.length >= 27, `expected the canon packs, got ${packs.length}`);
  for (const pack of packs) {
    const { manifest, errors } = await loadPackJson(pack.dir, { label: `the pack in ${pack.id}` });
    assert.notEqual(manifest, null, `${pack.id} must load`);
    assert.deepEqual(errors, [], `${pack.id}: ${whats(errors)}`);
  }
});

// One field order across 29 files, so a reader who has seen one manifest can find
// their way in any of them. The schema's own property order is the authority —
// there is no second list here to drift from it.
test('the real corpus: every manifest declares its fields in the schema\'s order', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync(join(CANON_ROOT, 'engine/pack_loader/pack.schema.json'), 'utf8'));
  const order = Object.keys(schema.properties);
  for (const pack of await loadPacks({ localRoot: CANON_ROOT })) {
    const keys = Object.keys(JSON.parse(readFileSync(join(pack.dir, 'pack.json'), 'utf8')));
    assert.deepEqual(
      keys, [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      `${pack.id}/pack.json declares its fields out of order — the schema's order is: ${order.join(', ')}`
    );
  }
});

// Resolution runs even on a manifest the schema has already rejected — the pack
// still loads and still runs the checks it can. So every wrong-typed field has to
// survive being read: iterating a string where a list belongs would try to import
// single characters, and reading through a missing object would throw out of the
// loader and take every other pack's checks down with it.
test('a manifest with wrong-typed fields is reported, never thrown out of', async () => {
  const { manifest, errors } = await load({
    ...BASE,
    worldRules: 'a.mjs',
    workRules: { nope: true },
    helpers: 'lib.mjs',
    contributes: ['barriers'],
    detect: {},
    env: [],
  });
  assert.notEqual(manifest, null, 'the pack still loads');
  assert.deepEqual(manifest.worldRules, []);
  assert.equal(manifest.detect, null, 'an unusable fingerprint is inert, not a crash');
  for (const field of ['worldRules', 'workRules', 'helpers', 'contributes', 'detect', 'env']) {
    assert.match(whats(errors), new RegExp(`"${field}`), `${field} must be reported`);
  }
});

test('a detect spec whose trackedPath is not an object is inert rather than a throw', async () => {
  const { manifest, errors } = await load({ ...BASE, detect: { trackedPath: 'firebase.json' } });
  assert.equal(manifest.detect, null);
  assert.match(whats(errors), /"detect\.trackedPath"/);
});
