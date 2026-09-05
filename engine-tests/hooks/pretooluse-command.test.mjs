import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, makeTranscript } from '../helpers.mjs';

// The real PreToolUse command, run against a scratch repo whose own local pack
// declares action guards — the wiring a member's session actually executes.
const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks', 'pretooluse-command.mjs');

const run = (root, payload) => spawnSync(process.execPath, [HOOK], {
  cwd: root, input: JSON.stringify(payload), encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
});

const PACK = `export default {
  id: 'fixture-guards',
  ruleRoutingGuidance: { belongs: 'the fixture project only', excludes: 'anything portable' },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;
const DECLARED = JSON.stringify([
  {
    id: 'fixture-block', severity: 'blocking', scope: 'action', failureMessage: 'the fixture forbids it',
    guardToolCalls: [{ tool: 'Bash', inputField: 'command', match: '/\\bforbidden-cmd\\b/', what: 'ran forbidden-cmd', fix: 'do not' }],
  },
  {
    id: 'fixture-advise', severity: 'advisory', scope: 'action', failureMessage: 'the fixture frowns on it',
    guardToolCalls: [{ tool: 'Bash', inputField: 'command', match: '/\\bnoisy-cmd\\b/', what: 'ran noisy-cmd', fix: 'quieter' }],
  },
]);
const repo = (settings) => makeRepo({ changed: {
  '.claudinite-settings.json': JSON.stringify(settings),
  '.claudinite/local/packs/fixture-guards/pack.mjs': PACK,
  '.claudinite/local/packs/fixture-guards/RULES.md': '# fixture-guards\n\nNo standing rules.\n',
  '.claudinite/local/packs/fixture-guards/declared-checks.json': DECLARED,
} });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('a blocking action guard denies the call and hands the agent the finding', () => {
  const root = repo({ packs: ['local/fixture-guards'] });
  try {
    const r = run(root, bash('forbidden-cmd --now'));
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Blocked by fixture-block: ran forbidden-cmd\. the fixture forbids it\. Fix: do not/);
    assert.equal(r.stdout, '');
  } finally { cleanup(root); }
});

test('an advisory action guard allows the call and injects the finding as context', () => {
  const root = repo({ packs: ['local/fixture-guards'] });
  try {
    const r = run(root, bash('noisy-cmd'));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, 'PreToolUse');
    assert.equal(out.permissionDecision, 'allow');
    assert.match(out.additionalContext, /\[claudinite fixture-advise\] ran noisy-cmd\. the fixture frowns on it\. Fix: quieter/);
  } finally { cleanup(root); }
});

test('a call no guard names passes with nothing said', () => {
  const root = repo({ packs: ['local/fixture-guards'] });
  try {
    const r = run(root, bash('ls'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    const other = run(root, { tool_name: 'Read', tool_input: { file_path: 'x' } });
    assert.equal(other.status, 0);
    assert.equal(other.stdout, '');
  } finally { cleanup(root); }
});

test('the settings overrides apply: a demoted guard advises, a guard turned off is silent', () => {
  const demoted = repo({ packs: ['local/fixture-guards'], rules: { 'fixture-block': 'advisory' } });
  try {
    const r = run(demoted, bash('forbidden-cmd'));
    assert.equal(r.status, 0, r.stderr);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /fixture-block/);
  } finally { cleanup(demoted); }
  const off = repo({ packs: ['local/fixture-guards'], rules: { 'fixture-block': 'off' } });
  try {
    const r = run(off, bash('forbidden-cmd'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally { cleanup(off); }
});

test('an undeclared pack\'s guards bind nothing, and the remote-branch guard still blocks', () => {
  const root = repo({ packs: [] });
  try {
    assert.equal(run(root, bash('forbidden-cmd')).status, 0);
    const r = run(root, bash('git push origin --delete feature'));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /never delete a remote branch/);
  } finally { cleanup(root); }
});

const OP_SKILL = [
  '---', 'name: fixture-op', 'description: A rehearsal fixture skill.', 'metadata:',
  '  force-load-on-tool-calls:', "    - 'Bash.command /\\bforbidden-op\\b/'",
  '---', '# fixture-op', '',
].join('\n');
const opRepo = () => makeRepo({ changed: {
  '.claudinite-settings.json': JSON.stringify({ packs: ['local/fixture-guards'] }),
  '.claudinite/local/packs/fixture-guards/pack.mjs': PACK,
  '.claudinite/local/packs/fixture-guards/RULES.md': '# fixture-guards\n\nNo standing rules.\n',
  '.claudinite/local/packs/fixture-guards/skills/fixture-op/SKILL.md': OP_SKILL,
} });

test('a tool call a skill forces itself for is held until the skill is loaded, like an edit under a scoped path', () => {
  const root = opRepo();
  const loaded = makeTranscript([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'fixture-op' } }] } }]);
  try {
    const blocked = run(root, bash('forbidden-op --go'));
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /Bash is called only with the `fixture-op` skill loaded/);
    assert.match(blocked.stderr, /skill: "fixture-op"/);
    const allowed = run(root, { ...bash('forbidden-op --go'), transcript_path: loaded.path });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(run(root, bash('ls')).status, 0);
  } finally { cleanup(root); loaded.cleanup(); }
});
