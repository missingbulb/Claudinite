import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'pretooluse-guard.mjs');

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

const CHECKIN =
  'Self check-in for PR #43. Re-check the PR state, CI status, mergeability, and any new review comments. If nothing changed, re-arm the next check-in silently ~1h out. Stop once the PR is merged or closed.';

test('blocks a deferred PR self-check-in across scheduling tools', () => {
  for (const payload of [
    { tool_name: 'mcp__claude-code-remote__send_later', tool_input: { delay_minutes: 60, message: CHECKIN } },
    { tool_name: 'ScheduleWakeup', tool_input: { prompt: CHECKIN, delaySeconds: 3600 } },
    { tool_name: 'mcp__claude-code-remote__create_trigger', tool_input: { prompt: 'Schedule a self check-in to re-check PR #7 hourly.' } },
    { tool_name: 'ScheduleWakeup', tool_input: { prompt: 'Wait for CI, then confirm it goes green and report back.', delaySeconds: 600 } },
  ]) {
    const r = runGuard(payload);
    assert.equal(r.status, 2, JSON.stringify(payload));
    assert.match(r.stderr, /query|check-run|re-arm|directly/i);
  }
});

test('allows legit scheduled reminders and unrelated tools', () => {
  for (const payload of [
    { tool_name: 'mcp__claude-code-remote__send_later', tool_input: { delay_minutes: 30, message: 'Remind me to review the design doc with Bob.' } },
    { tool_name: 'ScheduleWakeup', tool_input: { prompt: 'Resume the migration once the data export finishes.', delaySeconds: 900 } },
    { tool_name: 'Edit', tool_input: {} },
  ]) {
    assert.equal(runGuard(payload).status, 0, JSON.stringify(payload));
  }
});
