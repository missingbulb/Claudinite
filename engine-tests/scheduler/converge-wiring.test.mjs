import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  convergeSchedulerWorkflow, ensureHooks, removeRetiredCorpusImport, convergeWiring,
  SCHEDULER_WORKFLOW, SETTINGS_PATH,
} from '../../engine/scheduler/converge-wiring.mjs';
import { hashedCron } from '../../engine/scheduler/hash-minute.mjs';

const mkRepo = () => mkdtempSync(join(tmpdir(), 'claudinite-wiring-'));
const STUB = "name: Claudinite scheduler\non:\n  schedule:\n    - cron: '10 * * * *'\n  workflow_dispatch:\n";
const REPO = 'missingbulb/GoogleCalendarEventCreator';

test('convergeSchedulerWorkflow: writes the stub with the repo-hashed cron, and is idempotent', () => {
  const root = mkRepo();
  assert.equal(convergeSchedulerWorkflow(root, REPO, STUB), true);
  const written = readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8');
  assert.match(written, new RegExp(`cron: '${hashedCron(REPO).replace(/[*]/g, '\\*')}'`));
  assert.ok(!written.includes("cron: '10 * * * *'"), 'the placeholder minute is replaced');
  // second run: already converged → no write
  assert.equal(convergeSchedulerWorkflow(root, REPO, STUB), false);
});

test('ensureHooks: adds the three required hooks to a fresh repo, idempotently', () => {
  const root = mkRepo();
  const first = ensureHooks(root);
  assert.deepEqual(first.added.sort(), ['PreToolUse[Bash]', 'SessionStart', 'Stop']);
  const settings = JSON.parse(readFileSync(join(root, SETTINGS_PATH), 'utf8'));
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'bash $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-start-command.sh');
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash');
  // idempotent — nothing added on a second pass
  assert.deepEqual(ensureHooks(root).added, []);
});

test('ensureHooks: preserves a repo\'s own extra hooks (set-union, no clobber)', () => {
  const root = mkRepo();
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, SETTINGS_PATH), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo my-own-stop' }] }] },
  }, null, 2));
  ensureHooks(root);
  const settings = JSON.parse(readFileSync(join(root, SETTINGS_PATH), 'utf8'));
  const stopCommands = settings.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(stopCommands.includes('echo my-own-stop'), 'the repo\'s own hook survives');
  assert.ok(stopCommands.some((c) => c.includes('stop-command.mjs')), 'the required hook is added alongside');
});

test('ensureHooks: a malformed settings file is reported, never overwritten', () => {
  const root = mkRepo();
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, SETTINGS_PATH), '{ not json');
  const r = ensureHooks(root);
  assert.match(r.error, /not valid JSON/);
  assert.equal(readFileSync(join(root, SETTINGS_PATH), 'utf8'), '{ not json', 'left untouched');
});

test('removeRetiredCorpusImport: strips the #385 import line, idempotently', () => {
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), '# Project\n\n@.claudinite/shared/CLAUDE.md\n\nMore text\n');
  assert.equal(removeRetiredCorpusImport(root), true);
  const text = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(!text.includes('@.claudinite/shared/CLAUDE.md'));
  assert.ok(text.includes('More text'), 'the rest of CLAUDE.md is preserved');
  assert.equal(removeRetiredCorpusImport(root), false, 'idempotent — nothing to remove now');
});

test('removeRetiredCorpusImport: no CLAUDE.md is a no-op', () => {
  assert.equal(removeRetiredCorpusImport(mkRepo()), false);
});

test('convergeWiring: reports every surface it changed, and is idempotent', () => {
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), '@.claudinite/shared/CLAUDE.md\ndocs\n');
  const first = convergeWiring(root, REPO, STUB);
  assert.ok(first.changed.includes(SCHEDULER_WORKFLOW));
  assert.ok(first.changed.some((c) => c.startsWith('hook:')));
  assert.ok(first.changed.some((c) => c.includes('corpus import')));
  // second run: fully converged → nothing changes
  assert.deepEqual(convergeWiring(root, REPO, STUB).changed, []);
});
