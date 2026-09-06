import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, makeTranscript } from '../helpers.mjs';

// The two nudging hooks, run for real against a scratch repo whose own local
// pack bundles a skill with a prompt trigger and a result trigger.
const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks');
const run = (hook, root, payload) => spawnSync(process.execPath, [join(HOOKS, hook)], {
  cwd: root, input: JSON.stringify(payload), encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
});

const PACK = `export default {
  id: 'fixture-nudge',
  ruleRoutingGuidance: { belongs: 'the fixture project only', excludes: 'anything portable' },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;
const SKILL = [
  '---', 'name: fixture-nudge-skill', 'description: A rehearsal fixture skill.', 'metadata:',
  '  force-load-on-prompts-matching:', "    - '/\\bSHIPIT\\b/'",
  '  force-load-on-tool-results-matching:', "    - 'WebFetch /EGRESS_BLOCKED|\\b403\\b/'",
  '---', '# fixture', '',
].join('\n');
const repo = () => makeRepo({ changed: {
  '.claudinite-settings.json': JSON.stringify({ packs: ['local/fixture-nudge'] }),
  '.claudinite/local/packs/fixture-nudge/pack.mjs': PACK,
  '.claudinite/local/packs/fixture-nudge/RULES.md': '# fixture-nudge\n\nNo standing rules.\n',
  '.claudinite/local/packs/fixture-nudge/skills/fixture-nudge-skill/SKILL.md': SKILL,
} });
const context = (r) => JSON.parse(r.stdout).hookSpecificOutput;

test('UserPromptSubmit: a prompt a skill forces itself for gets the load instruction; a loaded skill is not asked again', () => {
  const root = repo();
  const loaded = makeTranscript([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'fixture-nudge-skill' } }] } }]);
  try {
    const hit = run('user-prompt-submit-command.mjs', root, { prompt: 'SHIPIT please' });
    assert.equal(hit.status, 0, hit.stderr);
    assert.equal(context(hit).hookEventName, 'UserPromptSubmit');
    assert.match(context(hit).additionalContext, /matches the `fixture-nudge-skill` skill's trigger .*load it before acting on the prompt: Skill tool, skill: "fixture-nudge-skill"/);
    const miss = run('user-prompt-submit-command.mjs', root, { prompt: 'carry on' });
    assert.equal(miss.status, 0);
    assert.equal(miss.stdout, '');
    const already = run('user-prompt-submit-command.mjs', root, { prompt: 'SHIPIT', transcript_path: loaded.path });
    assert.equal(already.stdout, '');
  } finally { cleanup(root); loaded.cleanup(); }
});

test('PostToolUse: a result a skill forces itself for gets the load instruction, by tool', () => {
  const root = repo();
  try {
    const hit = run('post-tool-use-command.mjs', root, { tool_name: 'WebFetch', tool_input: { url: 'https://x' }, tool_response: 'HTTP 403 Forbidden' });
    assert.equal(hit.status, 0, hit.stderr);
    assert.equal(context(hit).hookEventName, 'PostToolUse');
    assert.match(context(hit).additionalContext, /this WebFetch result matches the `fixture-nudge-skill` skill's trigger/);
    const other = run('post-tool-use-command.mjs', root, { tool_name: 'Bash', tool_input: { command: 'x' }, tool_response: { stdout: '403' } });
    assert.equal(other.stdout, '', 'a result trigger names its tool');
    const ok = run('post-tool-use-command.mjs', root, { tool_name: 'WebFetch', tool_input: {}, tool_response: { status: 200 } });
    assert.equal(ok.stdout, '');
  } finally { cleanup(root); }
});
