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

// The variables reach the build through the task's code-work, where the executor hands
// every repository variable over with nothing declared — so the frozen stub names none
// of them, and adding or changing one never needs a workflow edit in any member.
test('the seeded workflow names no variable — the build reads them task-side', () => {
  const yml = readFileSync(join(PACK_DIR, 'stubs/workflows/claudinite-dashboard-pages.yml'), 'utf8');
  for (const name of Object.values(SIGN_IN_VARS)) {
    assert.doesNotMatch(yml, new RegExp(name), `${name} must not be frozen into the stub`);
  }
  assert.doesNotMatch(yml, /vars\./);
});
