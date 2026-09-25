import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { git } from '../../../engine-tests/helpers.mjs';
import rule from '../worldRules/store-codeowners.mjs';
import { codeownersBlock, withBlock } from '../store_codeowners.mjs';

const WRITER = join(dirname(fileURLToPath(import.meta.url)), '..', 'write_store_codeowners.mjs');
const PACK = 'claude-code-web-users-support';
const STORE = { repo: 'acme-owner/store' };
const RESOLVED = { ...STORE, path: 'preferences' };
const PEOPLE = ['preferences/README.md', 'preferences/acme-user/RULES.md', 'preferences/acme-user/skills/s/SKILL.md', 'preferences/zed/RULES.md'];

const ctx = (files, codeowners, config = STORE) => ({
  files: codeowners === undefined ? files : [...files, '.github/CODEOWNERS'],
  config: { packConfig: { [PACK]: config } },
  read: (f) => (f === '.github/CODEOWNERS' ? codeowners : null),
});
const fresh = (files = PEOPLE) => withBlock('', codeownersBlock(RESOLVED, files));

test('the block gives the store to its admin, each directory to its person beside the admin, and itself to the admin', () => {
  assert.deepEqual(codeownersBlock(RESOLVED, [...PEOPLE, 'preferences/Mixed/RULES.md']).split('\n').filter((l) => !l.startsWith('#')), [
    '/preferences/ @acme-owner',
    '/preferences/acme-user/ @acme-user @acme-owner',
    '/preferences/zed/ @zed @acme-owner',
    '/.github/CODEOWNERS @acme-owner',
  ]);
});

test('withBlock keeps what is outside the block, and regenerating is a no-op', () => {
  const once = withBlock('/docs/ @someone\n', codeownersBlock(RESOLVED, PEOPLE));
  assert.ok(once.startsWith('/docs/ @someone\n'));
  assert.equal(withBlock(once, codeownersBlock(RESOLVED, PEOPLE)), once);
  assert.doesNotMatch(withBlock(once, codeownersBlock(RESOLVED, ['preferences/acme-user/RULES.md'])), /@zed/);
});

test('a missing file, a stale block and an owner line after the block are each found', () => {
  assert.match(rule.run(ctx(PEOPLE, undefined))[0].fix, /write_store_codeowners\.mjs/);
  assert.match(rule.run(ctx(PEOPLE, fresh(['preferences/acme-user/RULES.md'])))[0].what, /\/preferences\/zed\/ @zed/);
  assert.match(rule.run(ctx(PEOPLE, `${fresh()}/preferences/zed/ @intruder\n`))[0].what, /after the generated block/);
  assert.deepEqual(rule.run(ctx(PEOPLE, `${fresh()}# a trailing comment\n`)), []);
});

test('inert in a repo that is not the store', () => {
  assert.deepEqual(rule.run(ctx(['README.md'], undefined)), []);
  assert.deepEqual(rule.run(ctx(PEOPLE, undefined, { repo: 'not-a-repo' })), []);
});

test('the writer regenerates the block from the tracked tree, and the check then passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-codeowners-'));
  try {
    git(root, 'init', '-q');
    writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: [{ id: PACK, config: STORE }] }));
    for (const f of PEOPLE) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), 'x\n'); }
    mkdirSync(join(root, '.github'));
    writeFileSync(join(root, '.github', 'CODEOWNERS'), '/docs/ @someone\n');
    git(root, 'add', '-A');

    const r = spawnSync('node', [WRITER], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    assert.equal(r.status, 0, r.stderr);
    const written = readFileSync(join(root, '.github', 'CODEOWNERS'), 'utf8');
    assert.ok(written.startsWith('/docs/ @someone\n'));
    assert.deepEqual(rule.run(ctx(PEOPLE, written)), []);
  } finally { removeTree(root); }
});
