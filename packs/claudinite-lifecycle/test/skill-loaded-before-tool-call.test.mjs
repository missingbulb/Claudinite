import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import { discoverPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import rule from '../workRules/skill-loaded-before-editing.mjs';

// The tool-call half of the Stop-time rule: a call a skill forces itself for,
// made before the session loaded that skill, is a finding whether or not the
// PreToolUse guard saw it.
const PACK = `export default {
  id: 'fixture-op',
  ruleRoutingGuidance: { belongs: 'the fixture project only', excludes: 'anything portable' },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;
const SKILL = ['---', 'name: op-skill', 'description: fixture', 'metadata:', '  force-load-on-tool-calls:', "    - 'Bash.command /\\bdeploy\\b/'", '---', '# op', ''].join('\n');
const call = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

async function judge(entries) {
  const root = makeRepo({ changed: {
    '.claudinite-settings.json': JSON.stringify({ packs: ['local/fixture-op'] }),
    '.claudinite/local/packs/fixture-op/pack.mjs': PACK,
    '.claudinite/local/packs/fixture-op/RULES.md': '# fixture-op\n',
    '.claudinite/local/packs/fixture-op/skills/op-skill/SKILL.md': SKILL,
  } });
  const session = makeTranscript(entries);
  try {
    const ctx = buildContext({ root, mode: 'all', transcriptPath: session.path });
    ctx.packs = (await discoverPacks({ localRoot: root })).packs;
    return runRule(rule, ctx).map((f) => [f.file, f.what]);
  } finally { cleanup(root); session.cleanup(); }
}

test('a forced call before the load flags once per skill; the load before the call is clean', async () => {
  assert.deepEqual(await judge([call('Bash', { command: 'deploy --prod' }), call('Bash', { command: 'deploy --again' })]), [
    ['(session) Bash call', "a Bash call the fixture-op pack's `op-skill` skill forces itself for (Bash.command /\\bdeploy\\b/) ran before this session loaded that skill"],
  ]);
  assert.deepEqual(await judge([call('Skill', { skill: 'op-skill' }), call('Bash', { command: 'deploy --prod' })]), []);
  assert.deepEqual(await judge([call('Bash', { command: 'ls' })]), []);
});

test('a load after the call is the review the skill was meant to spare — still a finding', async () => {
  const findings = await judge([call('Bash', { command: 'deploy' }), call('Skill', { skill: 'op-skill' })]);
  assert.equal(findings.length, 1);
});
