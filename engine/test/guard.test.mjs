import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'pretooluse-guard.mjs');

function runGuard(payload) {
  return spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: 'utf8' });
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
