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

const here = dirname(fileURLToPath(import.meta.url));
const WRITER = join(here, '..', 'write_store_codeowners.mjs');
const PACK = 'claude-code-web-users-support';
const STORE = { repo: 'acme-owner/store' };
const PEOPLE = ['preferences/README.md', 'preferences/acme-user/RULES.md', 'preferences/acme-user/skills/s/SKILL.md', 'preferences/me@example.com/RULES.md'];

const ctx = (files, codeowners, config = STORE) => ({
  files: codeowners === undefined ? files : [...files, '.github/CODEOWNERS'],
  config: { packConfig: { [PACK]: config } },
  read: (f) => (f === '.github/CODEOWNERS' ? codeowners ?? null : null),
});
const ownerLines = (text) => text.split('\n').filter((l) => l && !l.startsWith('#'));

test('the block gives the store to its admin, each directory to its person, and itself to the admin', () => {
  const lines = ownerLines(codeownersBlock({ repo: 'acme-owner/store', path: 'preferences' }, PEOPLE));
  assert.deepEqual(lines, [
    '/preferences/ @acme-owner',
    // GitHub never counts a PR's author as its code owner's approval, so the admin is listed
    // beside each person: someone must be able to approve a person's edit of their own pack.
    '/preferences/acme-user/ @acme-user @acme-owner',
    // The legacy email form is owned by the email, which GitHub resolves to the account holding it.
    '/preferences/me@example.com/ me@example.com @acme-owner',
    '/.github/CODEOWNERS @acme-owner',
  ]);
});

test('an unaddressable directory gets no owner line - it falls to the admin line above it', () => {
  const lines = ownerLines(codeownersBlock({ repo: 'o/s', path: 'preferences' }, ['preferences/a b/RULES.md', 'preferences/Acme/RULES.md']));
  assert.deepEqual(lines, ['/preferences/ @o', '/.github/CODEOWNERS @o']);
});

test('withBlock replaces its own block and keeps everything else, twice in a row', () => {
  const block = codeownersBlock({ repo: 'o/s', path: 'preferences' }, PEOPLE);
  const once = withBlock('# mine\n/docs/ @someone\n', block);
  assert.ok(once.startsWith('# mine\n/docs/ @someone\n'));
  assert.equal(withBlock(once, block), once, 'regenerating is a no-op');
  const other = codeownersBlock({ repo: 'o/s', path: 'preferences' }, ['preferences/acme-user/RULES.md']);
  const replaced = withBlock(once, other);
  assert.equal(replaced.match(/BEGIN GENERATED/g).length, 1);
  assert.doesNotMatch(replaced, /me@example\.com/);
});

test('a store with no CODEOWNERS is found', () => {
  const found = rule.run(ctx(PEOPLE, undefined));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, '.github/CODEOWNERS');
  assert.match(found[0].fix, /write_store_codeowners\.mjs/);
});

test('a block out of step with the directories is found, and the generated one is clean', () => {
  const stale = withBlock('', codeownersBlock({ repo: 'acme-owner/store', path: 'preferences' }, ['preferences/acme-user/RULES.md']));
  const found = rule.run(ctx(PEOPLE, stale));
  assert.equal(found.length, 1);
  assert.match(found[0].what, /me@example\.com/);
  const fresh = withBlock('', codeownersBlock({ repo: 'acme-owner/store', path: 'preferences' }, PEOPLE));
  assert.deepEqual(rule.run(ctx(PEOPLE, fresh)), []);
});

test('an owner line after the block is found - the last matching line wins', () => {
  const fresh = withBlock('', codeownersBlock({ repo: 'acme-owner/store', path: 'preferences' }, PEOPLE));
  const found = rule.run(ctx(PEOPLE, `${fresh}/preferences/acme-user/ @intruder\n`));
  assert.equal(found.length, 1);
  assert.match(found[0].what, /after/);
  assert.deepEqual(rule.run(ctx(PEOPLE, `${fresh}\n# a trailing comment\n`)), []);
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
