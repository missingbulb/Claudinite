// What a converge WROTE, classified: which of the cycle's own writes a member's
// own test suite could possibly see. The pack-update flow asks this to decide
// whether the deterministic half may merge on its own or has to hand the branch
// to the apply stage, whose session re-runs those tests (#1932).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  isConvergeBookkeeping, stampOnlySettingsEdit, changesTestsCouldSee,
} from '../packs/claudinite-lifecycle/updates/converge-scope.mjs';
import { removeTree } from '../engine/remove-tree.mjs';
import { RULES_INDEX_FILE } from '../engine/pack_loader/generate-rules-index.mjs';
import { CLAUDE_MD, MOUNT_ATTRIBUTES_FILE, SETTINGS_PATH } from '../engine/converge-wiring.mjs';

test('a vendored pack tree is the one write nothing a member runs can see', () => {
  assert.equal(isConvergeBookkeeping('.claudinite/shared/packs/basics/RULES.md'), true);
  assert.equal(isConvergeBookkeeping('.claudinite/shared/packs/basics/workRules/x.mjs'), true);
  assert.equal(isConvergeBookkeeping('.claudinite/shared/engine/selftest.mjs'), false,
    'engine code is what a member\'s checks execute');
  assert.equal(isConvergeBookkeeping('.claudinite/local/packs/mine/RULES.md'), false,
    'a local pack is the member\'s own content, not a vendored tree');
  assert.equal(isConvergeBookkeeping('src/app.mjs'), false);
  assert.equal(isConvergeBookkeeping('.claudinite-checks.json'), false);
});

test('the mount\'s own wiring rides with the packs — its content IS the pack set', () => {
  for (const file of [RULES_INDEX_FILE, CLAUDE_MD, MOUNT_ATTRIBUTES_FILE, SETTINGS_PATH]) {
    assert.equal(isConvergeBookkeeping(file), true, `${file} moves with the pack set, not with the repo`);
  }
});

test('a settings edit that moved only the installed stamp is bookkeeping, not configuration', () => {
  const before = JSON.stringify({ packs: [{ id: 'basics', version: 3 }], engineVersion: 10 });
  assert.equal(stampOnlySettingsEdit(before, JSON.stringify({
    packs: [{ id: 'basics', version: 4 }], engineVersion: 11,
  })), true);
  assert.equal(stampOnlySettingsEdit(before, JSON.stringify({
    packs: [{ id: 'basics', version: 4 }], engineVersion: 11, delivery: 'review',
  })), false, 'a key a migration added is a configuration change');
  assert.equal(stampOnlySettingsEdit(before, JSON.stringify({
    packs: [{ id: 'basics', version: 3 }, { id: 'jwt' }], engineVersion: 10,
  })), false, 'a newly declared pack changes which rules and checks the repo runs');
  assert.equal(stampOnlySettingsEdit(before, JSON.stringify({
    packs: [{ id: 'basics', version: 3, config: { strict: true } }], engineVersion: 10,
  })), false, 'a pack\'s own config sits on the same entry as its version');
  assert.equal(stampOnlySettingsEdit(before, '{'), false, 'unparseable on either side is never "just the stamp"');
  assert.equal(stampOnlySettingsEdit(null, before), false, 'a file that did not exist before is not a stamp move');
});

// --- over a real checkout -----------------------------------------------------

function gitMember() {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-scope-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  const put = (rel, content) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  put('.claudinite-settings.json', `${JSON.stringify({ packs: [{ id: 'basics', version: 3 }], engineVersion: 10 }, null, 2)}\n`);
  put('.claudinite/shared/packs/basics/RULES.md', 'old\n');
  put('.claudinite/shared/engine/selftest.mjs', 'export const a = 1;\n');
  put('src/app.mjs', 'code\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  return { root, put };
}

test('a pure pack re-vendor, stamp and index included, is seen by nothing the member runs', () => {
  const { root, put } = gitMember();
  put('.claudinite/shared/packs/basics/RULES.md', 'new\n');
  put('.claudinite/claudinite-rules.GENERATED.md', 'index\n');
  put('.claudinite-settings.json', `${JSON.stringify({ packs: [{ id: 'basics', version: 4 }], engineVersion: 10 }, null, 2)}\n`);
  assert.deepEqual(changesTestsCouldSee(root), []);
  removeTree(root);
});

test('engine code, a configuration key and a repo source file each surface', () => {
  const { root, put } = gitMember();
  put('.claudinite/shared/engine/selftest.mjs', 'export const a = 2;\n');
  assert.deepEqual(changesTestsCouldSee(root), ['.claudinite/shared/engine/selftest.mjs']);

  // The same file the stamp rides in — what makes this one visible is that a key a
  // record ADDED moved with it, which is a change to what this repo's checks run.
  put('.claudinite-settings.json', `${JSON.stringify({
    packs: [{ id: 'basics', version: 4 }], engineVersion: 10, rules: { 'some-rule': 'blocking' },
  }, null, 2)}\n`);
  put('src/app.mjs', 'rewritten by a migration\n');
  assert.deepEqual(changesTestsCouldSee(root), [
    '.claudinite-settings.json', '.claudinite/shared/engine/selftest.mjs', 'src/app.mjs',
  ]);
  removeTree(root);
});

test('a deleted repo file is a change a test can see', () => {
  const { root } = gitMember();
  rmSync(join(root, 'src', 'app.mjs'));
  assert.deepEqual(changesTestsCouldSee(root), ['src/app.mjs']);
  removeTree(root);
});

test('a tree git cannot be asked about answers nothing rather than throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-nogit-'));
  assert.deepEqual(changesTestsCouldSee(root), []);
  removeTree(root);
});
