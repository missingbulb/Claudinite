import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  convergeSchedulerWorkflow, ensureHooks, removeRetiredCorpusImport, convergeWiring,
  withDeclaredSecrets, SCHEDULER_WORKFLOW, SETTINGS_PATH,
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

// --- required_secrets delivery (agent-preprocessing DESIGN §9) --------------
// Actions needs every secret named statically in the workflow, so a task's
// `required_secrets` IS that list and the wiring converge writes it. These cover
// the whole delivery mechanism — there is no other secrets code.

const ENV_STUB = "jobs:\n  schedule:\n    steps:\n      - name: Evaluate\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: node run.mjs\n";

test('withDeclaredSecrets: stamps each declared name beside GITHUB_TOKEN', () => {
  const out = withDeclaredSecrets(ENV_STUB, ['SOME_API_KEY', 'OTHER_KEY']);
  assert.match(out, /GITHUB_TOKEN: \$\{\{ github\.token \}\}\n {10}SOME_API_KEY: \$\{\{ secrets\.SOME_API_KEY \}\}\n {10}OTHER_KEY: \$\{\{ secrets\.OTHER_KEY \}\}\n/);
  assert.match(out, /^ {8}run: node run\.mjs$/m);   // the step is otherwise untouched
});

test('withDeclaredSecrets: no declarations leaves the stub byte-identical', () => {
  assert.equal(withDeclaredSecrets(ENV_STUB, []), ENV_STUB);
  assert.equal(withDeclaredSecrets(ENV_STUB), ENV_STUB);
});

test('withDeclaredSecrets: regenerating from the stub tracks the declarations rather than accumulating', () => {
  // The converge always starts from the stub, so dropping a task's declaration
  // drops its line — the workflow can never grow stale secret names.
  const first = withDeclaredSecrets(ENV_STUB, ['A_KEY', 'B_KEY']);
  const second = withDeclaredSecrets(ENV_STUB, ['A_KEY']);
  assert.match(first, /B_KEY/);
  assert.ok(!second.includes('B_KEY'));
  assert.match(second, /A_KEY: \$\{\{ secrets\.A_KEY \}\}/);
});

test('convergeSchedulerWorkflow: the declared secrets land in the written workflow, and re-converge is idempotent', () => {
  const root = mkRepo();
  const stub = `${STUB}${ENV_STUB}`;
  assert.equal(convergeSchedulerWorkflow(root, REPO, stub, ['SOME_API_KEY']), true);
  const written = readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8');
  assert.match(written, /SOME_API_KEY: \$\{\{ secrets\.SOME_API_KEY \}\}/);
  assert.match(written, new RegExp(`cron: '${hashedCron(REPO).replace(/[*]/g, '\\*')}'`));
  assert.equal(convergeSchedulerWorkflow(root, REPO, stub, ['SOME_API_KEY']), false);
  // and a changed declaration set rewrites it
  assert.equal(convergeSchedulerWorkflow(root, REPO, stub, []), true);
  assert.ok(!readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8').includes('SOME_API_KEY'));
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
