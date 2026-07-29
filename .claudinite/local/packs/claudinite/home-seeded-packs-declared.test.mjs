import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import rule from './home-seeded-packs-declared.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

// A canon pack module, as the home's packs/ tree carries it.
const packModule = (id, { seeded = false } = {}) =>
  `export default {\n  id: '${id}',\n  prose: 'RULES.md',\n${seeded ? '  seededByDefault: true,\n' : ''}  rules: [],\n};\n`;

const settings = (packs) => `${JSON.stringify({ packs }, null, 2)}\n`;

test('home-seeded-packs-declared: silent when every seeded pack is declared', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', { seeded: true }),
      'packs/tidy-repo/pack.mjs': packModule('tidy-repo', { seeded: true }),
      'packs/leaflet/pack.mjs': packModule('leaflet'),
      '.claudinite-checks.json': settings(['basics', 'tidy-repo', 'local/claudinite']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: fires when a seeded pack is missing from the declaration', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', { seeded: true }),
      // Newly seeded upstream; baselining is gated !isHome, so it never arrives here.
      'packs/tidy-repo/pack.mjs': packModule('tidy-repo', { seeded: true }),
      '.claudinite-checks.json': settings(['basics', 'local/claudinite']),
    },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'home-seeded-packs-declared');
    assert.equal(findings[0].file, '.claudinite-checks.json');
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /tidy-repo/);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: reports every undeclared seeded pack, not just the first', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', { seeded: true }),
      'packs/grow_with_claudinite/pack.mjs': packModule('grow_with_claudinite', { seeded: true }),
      'packs/tidy-repo/pack.mjs': packModule('tidy-repo', { seeded: true }),
      '.claudinite-checks.json': settings(['basics']),
    },
  });
  try {
    const ids = run(root).map((f) => f.what).join(' ');
    assert.match(ids, /grow_with_claudinite/);
    assert.match(ids, /tidy-repo/);
    assert.equal(run(root).length, 2);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: an entry object declares the pack just as a bare id does', () => {
  const root = makeRepo({
    base: {
      'packs/grow_with_claudinite/pack.mjs': packModule('grow_with_claudinite', { seeded: true }),
      '.claudinite-checks.json': settings([{ id: 'grow_with_claudinite', config: { promote: false } }]),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('home-seeded-packs-declared: seededByDefault written in a comment is not a seeded pack', () => {
  const root = makeRepo({
    base: {
      // The flag appears only in prose about it — parsing past comments is what
      // keeps a pack that merely *discusses* seeding out of the required set.
      'packs/leaflet/pack.mjs':
        "// A technology pack is never seededByDefault: true — it is fingerprinted.\n" +
        "/* seededByDefault: true */\n" +
        packModule('leaflet'),
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
      'packs/basics/pack.mjs': packModule('basics', { seeded: true }),
      '.claudinite/local/packs/mine/pack.mjs': packModule('mine', { seeded: true }),
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
      '.claudinite/shared/packs/basics/pack.mjs': packModule('basics', { seeded: true }),
      '.claudinite-checks.json': settings(['github-actions']),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});
