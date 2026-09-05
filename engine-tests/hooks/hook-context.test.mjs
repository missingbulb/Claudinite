import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, makeTranscript } from '../helpers.mjs';
import { hookContext, cacheFile, sessionReader } from '../../engine/hooks/hook-context.mjs';
import { missingSkillsForCall } from '../../engine/pack_loader/path-scoped-skills.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks', 'pretooluse-command.mjs');
const hook = (root, command) => spawnSync(process.execPath, [HOOK], {
  cwd: root, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
});

// The cached derivation: the first read of a project loads the registry and
// writes the cache, the next reads the cache — and any change to what the
// derivation read from (a trigger, a skill, a declaration, the settings) misses
// and re-derives. Both paths must hand a judge the same data.
const PACK = `export default {
  id: 'fixture-cache',
  ruleRoutingGuidance: { belongs: 'the fixture project only', excludes: 'anything portable' },
  detect: null, marker: null, prose: 'RULES.md', worldRules: [], workRules: [],
};
`;
const skill = (name, trigger) => [
  '---', `name: ${name}`, 'description: A rehearsal fixture skill.', 'metadata:',
  '  force-load-on-file-edits-paths:', "    - 'docs/**'",
  '  force-load-on-tool-calls:', `    - '${trigger}'`,
  '---', `# ${name}`, '',
].join('\n');
const DECLARED = JSON.stringify([{
  id: 'fixture-cache-guard', severity: 'advisory', scope: 'action', failureMessage: 'the fixture frowns on it',
  guardToolCalls: [{ tool: 'Bash', inputField: 'command', match: '/\\bnoisy\\b/', what: 'ran {match}', fix: 'quieter' }],
}]);
const PACK_DIR = '.claudinite/local/packs/fixture-cache';
const repo = () => makeRepo({ changed: {
  '.claudinite-settings.json': JSON.stringify({ packs: ['local/fixture-cache'] }),
  [`${PACK_DIR}/pack.mjs`]: PACK,
  [`${PACK_DIR}/RULES.md`]: '# fixture-cache\n\nNo standing rules.\n',
  [`${PACK_DIR}/declared-checks.json`]: DECLARED,
  [`${PACK_DIR}/skills/fixture-a/SKILL.md`]: skill('fixture-a', 'Bash.command /\\bone\\b/'),
} });
const dropCache = (root) => { try { unlinkSync(cacheFile(root)); } catch { /* none yet */ } };
const strip = ({ overrides, source, ...rest }) => rest;

test('the first read derives and writes, the second reads the cache, and both hand a judge the same data', async () => {
  const root = repo();
  dropCache(root);
  try {
    const first = await hookContext(root, 'test');
    assert.equal(first.source, 'registry');
    assert.equal(first.scoped.length, 1);
    assert.equal(first.triggered.length, 1);
    assert.equal(first.actionRules.length, 1);
    assert.ok(first.scoped[0].re instanceof RegExp);
    assert.ok(first.triggered[0].pattern instanceof RegExp);
    assert.ok(first.actionRules[0].spec.guardToolCalls[0].match instanceof RegExp);
    const second = await hookContext(root, 'test');
    assert.equal(second.source, 'cache');
    assert.deepEqual(strip(second), strip(first));
    assert.deepEqual(second.overrides, {});
  } finally { dropCache(root); cleanup(root); }
});

test('a trigger edited, a skill added, a declaration changed, a pack declared — each misses and re-derives', async () => {
  const root = repo();
  dropCache(root);
  try {
    await hookContext(root, 'test');
    assert.equal((await hookContext(root, 'test')).source, 'cache');

    writeFileSync(join(root, PACK_DIR, 'skills/fixture-a/SKILL.md'), skill('fixture-a', 'Bash.command /\\bone-edited\\b/'));
    const afterEdit = await hookContext(root, 'test');
    assert.equal(afterEdit.source, 'registry');
    assert.match(afterEdit.triggered[0].source, /one-edited/);
    assert.equal((await hookContext(root, 'test')).source, 'cache');

    mkdirSync(join(root, PACK_DIR, 'skills/fixture-b'), { recursive: true });
    writeFileSync(join(root, PACK_DIR, 'skills/fixture-b/SKILL.md'), skill('fixture-b', 'WebFetch'));
    const afterAdd = await hookContext(root, 'test');
    assert.equal(afterAdd.source, 'registry');
    assert.equal(afterAdd.triggered.length, 2);
    assert.equal((await hookContext(root, 'test')).source, 'cache');

    // The registry memoises a declarations file per process, so the flipped
    // severity is read by fresh hook processes — the way a session reads it:
    // the first derives and writes, the second reads what the first wrote.
    writeFileSync(join(root, PACK_DIR, 'declared-checks.json'), DECLARED.replace('advisory', 'blocking'));
    assert.equal((await hookContext(root, 'test')).source, 'registry');
    dropCache(root);
    assert.equal(hook(root, 'noisy').status, 2, 'the flipped declaration blocks through a fresh process');
    assert.equal(hook(root, 'noisy').status, 2, 'and again through the cache the first one wrote');

    writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: [], rules: { 'fixture-cache-guard': 'off' } }));
    const afterSettings = await hookContext(root, 'test');
    assert.equal(afterSettings.source, 'registry');
    assert.equal(afterSettings.actionRules.length, 0);
    assert.deepEqual(afterSettings.overrides, { 'fixture-cache-guard': 'off' });
  } finally { dropCache(root); cleanup(root); }
});

test('a cache that cannot be read is a miss, never a failure', async () => {
  const root = repo();
  dropCache(root);
  try {
    await hookContext(root, 'test');
    writeFileSync(cacheFile(root), '{ truncated');
    assert.equal((await hookContext(root, 'test')).source, 'registry');
    assert.equal((await hookContext(root, 'test')).source, 'cache');
    const record = JSON.parse(readFileSync(cacheFile(root), 'utf8'));
    writeFileSync(cacheFile(root), JSON.stringify({ ...record, version: record.version + 1 }));
    assert.equal((await hookContext(root, 'test')).source, 'registry', 'a record from another engine version misses');
  } finally { dropCache(root); cleanup(root); }
});

test('the session reader is asked only once a trigger hits, and answers from one parse', () => {
  const session = makeTranscript([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'fixture-a' } }] } }]);
  try {
    let asked = 0;
    const reader = sessionReader(session.path);
    const loaded = () => { asked += 1; return reader.loaded(); };
    const declarations = [{ pack: 'p', skill: 'fixture-a', dir: '/p/skills/fixture-a', kind: 'toolCall', tool: 'Bash', field: 'command', pattern: /\bone\b/, source: 'Bash.command /one/' }];
    assert.deepEqual(missingSkillsForCall({ name: 'Bash', input: { command: 'ls' } }, declarations, loaded), []);
    assert.equal(asked, 0, 'a call no trigger names never reads the transcript');
    assert.deepEqual(missingSkillsForCall({ name: 'Bash', input: { command: 'one' } }, declarations, loaded), []);
    assert.equal(asked, 1, 'a hit reads it, and the loaded skill is not missing');
    assert.deepEqual(reader.calls().map((c) => c.name), ['Skill']);
  } finally { session.cleanup(); }
});
