import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import rule from './home-seeded-packs-declared.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

// A canon pack manifest, as the home's packs/ tree carries it.
const packManifest = (id, { seeded = false } = {}) =>
  `${JSON.stringify({ id, prose: 'RULES.md', ...(seeded ? { seededByDefault: true } : {}) }, null, 2)}\n`;

const settings = (packs) => `${JSON.stringify({ packs }, null, 2)}\n`;

test('home-seeded-packs-declared: silent when every seeded pack is declared', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.json': packManifest('basics', { seeded: true }),
      'packs/tidy-repo/pack.json': packManifest('tidy-repo', { seeded: true }),
      'packs/leaflet/pack.json': packManifest('leaflet'),
      '.claudinite-checks.json': settings(['basics', 'tidy-repo', 'local/claudinite']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: reports every undeclared seeded pack, not just the first', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.json': packManifest('basics', { seeded: true }),
      // Newly seeded upstream; baselining is gated !isHome, so they never arrive here.
      'packs/grow_with_claudinite/pack.json': packManifest('grow_with_claudinite', { seeded: true }),
      'packs/tidy-repo/pack.json': packManifest('tidy-repo', { seeded: true }),
      '.claudinite-checks.json': settings(['basics']),
    },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 2);
    const ids = findings.map((f) => f.what).join(' ');
    assert.match(ids, /grow_with_claudinite/);
    assert.match(ids, /tidy-repo/);
    for (const finding of findings) {
      assert.equal(finding.rule, 'home-seeded-packs-declared');
      assert.equal(finding.file, '.claudinite-checks.json');
      assert.equal(finding.severity, 'blocking');
    }
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: an entry object declares the pack just as a bare id does', () => {
  const root = makeRepo({
    base: {
      'packs/grow_with_claudinite/pack.json': packManifest('grow_with_claudinite', { seeded: true }),
      '.claudinite-checks.json': settings([{ id: 'grow_with_claudinite', config: { promote: false } }]),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: the flag named in a pack\'s prose is not a seeded pack', () => {
  const root = makeRepo({
    base: {
      // The flag appears only in prose ABOUT it. Parsing the manifest rather than
      // grepping the pack is what keeps a pack that merely *discusses* seeding out
      // of the required set.
      'packs/leaflet/pack.json': packManifest('leaflet'),
      'packs/leaflet/README.md': 'A technology pack is never `seededByDefault: true` — it is fingerprinted.\n',
      'packs/leaflet/RULES.md': 'Do not set seededByDefault: true on a technology pack.\n',
      '.claudinite-checks.json': settings(['basics']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: a manifest too broken to parse is the loader\'s finding, not this rule\'s', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.json': packManifest('basics', { seeded: true }),
      'packs/broken/pack.json': '{ "id": "broken", "seededByDefault": true,\n',
      '.claudinite-checks.json': settings(['basics']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: a local pack is never required by this rule', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.json': packManifest('basics', { seeded: true }),
      '.claudinite/local/packs/mine/pack.json': packManifest('mine', { seeded: true }),
      '.claudinite-checks.json': settings(['basics']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: silent in a repo that carries no canon packs/ tree', () => {
  const root = makeRepo({
    base: {
      '.claudinite/shared/packs/basics/pack.json': packManifest('basics', { seeded: true }),
      '.claudinite-checks.json': settings(['github-actions']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});
