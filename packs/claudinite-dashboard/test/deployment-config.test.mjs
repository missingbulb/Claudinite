import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { deploymentConfig, SIGN_IN_VARS } from '../deployment-config.mjs';

const PACK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const member = (config) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-depcfg-'));
  writeFileSync(join(root, '.claudinite-settings.json'),
    JSON.stringify({ packs: [{ id: 'claudinite-dashboard', config }] }, null, 2));
  return root;
};

test('a repository variable is the sign-in pair\'s store, and reports no fallback', async (t) => {
  const root = member({ mode: 'repo' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {
    [SIGN_IN_VARS.clientId]: 'Iv1.fromVar',
    [SIGN_IN_VARS.exchangeUrl]: 'https://w.example',
  });
  assert.equal(cfg.clientId, 'Iv1.fromVar');
  assert.equal(cfg.exchangeUrl, 'https://w.example');
  assert.deepEqual(legacy, []);
});

// Nothing converges a member's own settings file, so a deployment configured before the
// variables existed must keep its button rather than lose it on the next build.
test('a declared pair still works, and every key that fell back is named', async (t) => {
  const root = member({ mode: 'repo', clientId: 'Iv1.declared', exchangeUrl: 'https://old.example' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {});
  assert.equal(cfg.clientId, 'Iv1.declared');
  assert.equal(cfg.exchangeUrl, 'https://old.example');
  assert.equal(legacy.length, 2);
  assert.match(legacy.join(' '), /clientId.*CLAUDINITE_DASHBOARD_CLIENT_ID/);
  assert.match(legacy.join(' '), /exchangeUrl.*CLAUDINITE_DASHBOARD_EXCHANGE_URL/);
});

// A cleared settings box arrives as an empty string, not as an absent name. Reading
// that as an override would turn clearing one variable into a silently disabled button
// on a deployment whose declaration still carries the value.
test('an empty variable is unset, not an override', async (t) => {
  const root = member({ mode: 'repo', clientId: 'Iv1.declared' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, { [SIGN_IN_VARS.clientId]: '   ' });
  assert.equal(cfg.clientId, 'Iv1.declared');
  assert.equal(legacy.length, 1);
});

test('a repo with neither store configured is an ordinary token-box deployment', async (t) => {
  const root = member({ mode: 'repo' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {});
  assert.equal(cfg.clientId, undefined);
  assert.deepEqual(legacy, []);
});

// The hole a variable opens that a config key does not: the deploy workflow skips the
// build when a cache key over the SOURCE FILES is unchanged, and no file hash covers a
// repository variable. Without the pair in the key, changing either would hit the cache
// and leave the site serving the previous client id with nothing to show for it.
test('the seeded workflow passes both variables and folds them into its cache key', () => {
  const yml = readFileSync(join(PACK_DIR, 'stubs/workflows/claudinite-dashboard-pages.yml'), 'utf8');
  for (const name of Object.values(SIGN_IN_VARS)) {
    assert.match(yml, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`),
      `${name} must reach the build`);
  }
  const sources = /- name: What the page would be built from[\s\S]*?(?=\n      - )/.exec(yml)?.[0] ?? '';
  // The KEY LINE, not the step around it: the variables also appear in this step's own
  // `env:`, so asserting over the whole block passes just as happily with the digest
  // dropped from the key — which is the entire bug this test exists for.
  const keyLine = sources.split('\n').find((l) => l.includes('key=dashboard-deployed-'));
  assert.ok(keyLine, 'the step must still compute a cache key');
  const digest = /signin=\$\(([^)]*\)[^)]*)\)/.exec(sources)?.[0] ?? '';
  assert.match(digest, /sha256sum/, 'the variables must be hashed into something');
  for (const name of Object.values(SIGN_IN_VARS)) {
    assert.ok(digest.includes(name), `${name} must be part of that digest`);
  }
  assert.match(keyLine, /\$signin/, 'and the digest must actually be in the cache key');
});
