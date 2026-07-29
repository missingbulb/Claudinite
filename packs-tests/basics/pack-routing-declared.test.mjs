import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule, { MAX_ROUTING_WORDS } from '../../packs/basics/pack-routing-declared.mjs';

const manifest = (routing) => `export default {
  id: 'mypack',
${routing}  detect: null,
  rules: [],
};
`;

const good = manifest(`  routing: {
    belongs: 'map rendering with the Leaflet library — tile layers, markers, CDN plugin pinning',
    excludes: 'generic HTML markup rules — that is html; dependency policy belongs to node',
  },
`);

const PACK = 'packs/mypack/pack.mjs';
const LOCAL_PACK = '.claudinite/local_packs/mypack/pack.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('pack-routing-declared: a pack.mjs with both routing sides yields no findings', () => {
  assert.deepEqual(run({ [PACK]: good }), []);
});

test('pack-routing-declared: is inert when no pack.mjs exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('pack-routing-declared: covers a consumer local pack the same way', () => {
  const findings = run({ [LOCAL_PACK]: manifest('') });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /declares no "routing" object/);
});

test('pack-routing-declared: flags a routing object missing a side', () => {
  const half = manifest(`  routing: {
    belongs: 'only one side of the boundary is stated here',
  },
`);
  const whats = run({ [PACK]: half }).map((f) => f.what).join(' | ');
  assert.match(whats, /"routing" declares no string "excludes"/);
  assert.doesNotMatch(whats, /"belongs"/);
});

test('pack-routing-declared: flags an empty side', () => {
  const empty = good.replace(/excludes: '[^']*'/, "excludes: '   '");
  const whats = run({ [PACK]: empty }).map((f) => f.what).join(' | ');
  assert.match(whats, /routing\.excludes is empty/);
});

test(`pack-routing-declared: flags a side over the ${MAX_ROUTING_WORDS}-word cap`, () => {
  const over = Array.from({ length: MAX_ROUTING_WORDS + 3 }, (_, i) => `word${i}`).join(' ');
  const long = good.replace(/belongs: '[^']*'/, `belongs: '${over}'`);
  const whats = run({ [PACK]: long }).map((f) => f.what).join(' | ');
  assert.match(whats, new RegExp(`routing\\.belongs is ${MAX_ROUTING_WORDS + 3} words, over the ${MAX_ROUTING_WORDS}-word cap`));
});

test('pack-routing-declared: accepts double-quoted routing strings', () => {
  const doubled = good.replace(/'([^']*)'/g, (_, s) => `"${s}"`);
  assert.deepEqual(run({ [PACK]: doubled }), []);
});

test('pack-routing-declared: the whole canon corpus declares its routing', async () => {
  const { loadPacks } = await import('../../engine/pack_loader/pack-registry.mjs');
  const packs = await loadPacks({ localRoot: process.cwd() });
  assert.ok(packs.length > 0, 'no packs discovered');
  for (const pack of packs) {
    assert.ok(pack.routing?.belongs, `${pack.id} declares no routing.belongs`);
    assert.ok(pack.routing?.excludes, `${pack.id} declares no routing.excludes`);
    for (const side of ['belongs', 'excludes']) {
      const n = pack.routing[side].trim().split(/\s+/).length;
      assert.ok(n <= MAX_ROUTING_WORDS, `${pack.id} routing.${side} is ${n} words`);
    }
  }
});
