import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTranscript } from './helpers.mjs';
import { removeTree } from '../engine/remove-tree.mjs';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'hooks', 'pretooluse-command.mjs');

function runGuard(payload, env = {}) {
  return spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('blocks remote-branch deletion in both forms', () => {
  for (const cmd of [
    'git push origin --delete feature-x',
    'git push -d origin feature-x',
    'git push origin :feature-x',
  ]) {
    const r = runGuard(bash(cmd));
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /never delete a remote branch/);
  }
});

test('allows ordinary pushes and non-Bash tools', () => {
  for (const payload of [
    bash('git push -u origin feature-x'),
    bash('git push --force-with-lease origin feature-x'),
    bash('git push origin main:refs/heads/main'),
    { tool_name: 'Edit', tool_input: {} },
  ]) {
    assert.equal(runGuard(payload).status, 0, JSON.stringify(payload));
  }
});

// --- path-scoped skills ---------------------------------------------------------

// A project declaring one local pack whose skill forces itself for product-wiki/**.
function scopedRepo() {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-guard-'));
  const pack = join(root, '.claudinite', 'local', 'packs', 'demo');
  mkdirSync(join(pack, 'skills', 'writing-wiki-pages'), { recursive: true });
  writeFileSync(join(pack, 'pack.mjs'), `export default {
  ruleRoutingGuidance: { belongs: 'demo', excludes: 'nothing' },
};
`);
  writeFileSync(join(pack, 'skills', 'writing-wiki-pages', 'SKILL.md'), '---\nname: writing-wiki-pages\ndescription: demo\nmetadata:\n  force-load-on-file-edits-paths:\n    - "product-wiki/**"\n---\n');
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: ['local/demo'] }));
  return root;
}

const skillLoad = (skill) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });
const edit = (root, file_path, transcript_path) => ({ tool_name: 'Edit', tool_input: { file_path: join(root, file_path) }, transcript_path });

test('a file tool on a scoped path is blocked until the skill is loaded, then allowed', () => {
  const root = scopedRepo();
  const bare = makeTranscript([{ type: 'user', message: { content: 'go' } }]);
  const loaded = makeTranscript([skillLoad('writing-wiki-pages')]);
  try {
    const blocked = runGuard(edit(root, 'product-wiki/Market/README.md', bare.path), { CLAUDE_PROJECT_DIR: root });
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /product-wiki\/Market\/README\.md is edited only with the `writing-wiki-pages` skill loaded/);
    assert.match(blocked.stderr, /skill: "writing-wiki-pages"/);

    assert.match(blocked.stderr, /or Read \.claudinite\/local\/packs\/demo\/skills\/writing-wiki-pages\/SKILL\.md/);

    const allowed = runGuard(edit(root, 'product-wiki/Market/README.md', loaded.path), { CLAUDE_PROJECT_DIR: root });
    assert.equal(allowed.status, 0, allowed.stderr);
    const readLoaded = makeTranscript([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: join(root, '.claude/skills/writing-wiki-pages/SKILL.md') } }] } }]);
    try {
      assert.equal(runGuard(edit(root, 'product-wiki/Market/README.md', readLoaded.path), { CLAUDE_PROJECT_DIR: root }).status, 0, 'a Read of the SKILL.md is a load');
    } finally { readLoaded.cleanup(); }

    // Write and NotebookEdit name their file the same way; a path outside every
    // pattern, and one outside the project, are never the guard's business.
    const write = runGuard({ tool_name: 'Write', tool_input: { file_path: join(root, 'product-wiki/README.md') }, transcript_path: bare.path }, { CLAUDE_PROJECT_DIR: root });
    assert.equal(write.status, 2, write.stderr);
    const notebook = runGuard({ tool_name: 'NotebookEdit', tool_input: { notebook_path: join(root, 'product-wiki/x.ipynb') }, transcript_path: bare.path }, { CLAUDE_PROJECT_DIR: root });
    assert.equal(notebook.status, 2, notebook.stderr);
    assert.equal(runGuard(edit(root, 'src/app.mjs', bare.path), { CLAUDE_PROJECT_DIR: root }).status, 0);
    assert.equal(runGuard({ tool_name: 'Edit', tool_input: { file_path: '/elsewhere/product-wiki/README.md' }, transcript_path: bare.path }, { CLAUDE_PROJECT_DIR: root }).status, 0);
  } finally {
    bare.cleanup(); loaded.cleanup(); removeTree(root);
  }
});

test('a project declaring no scoped skill, or one with no transcript, lets every edit through', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-guard-'));
  try {
    writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: ['basics'] }));
    assert.equal(runGuard(edit(root, 'product-wiki/README.md', '/nonexistent.jsonl'), { CLAUDE_PROJECT_DIR: root }).status, 0);
  } finally { removeTree(root); }
});
