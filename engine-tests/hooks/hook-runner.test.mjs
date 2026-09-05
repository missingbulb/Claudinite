import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../helpers.mjs';
import { removeTree } from '../../engine/remove-tree.mjs';

// A hook is a guest in the harness: exit 2 is the one block, and every other
// non-zero exit, timeout or malformed stdout is an error printed beside the
// call. These cases drive the real entries and the runner through every way a
// hook can fail — and assert the same thing each time: exit 0, and stdout that
// is empty or one complete JSON verdict. The deny cases in
// pretooluse-command.test.mjs are the positive control that the runner still
// blocks when asked to.
const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks');
const ENTRIES = ['pretooluse-command.mjs', 'post-tool-use-command.mjs', 'user-prompt-submit-command.mjs'];
const EVENTS = { 'pretooluse-command.mjs': 'PreToolUse', 'post-tool-use-command.mjs': 'PostToolUse', 'user-prompt-submit-command.mjs': 'UserPromptSubmit' };

const spawn = (file, root, input, env = {}) => spawnSync(process.execPath, [file], {
  cwd: root, input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
});
const run = (entry, root, payload, env) => spawn(join(HOOKS, entry), root, typeof payload === 'string' ? payload : JSON.stringify(payload), env);
const hookLog = (root) => { try { return readFileSync(join(root, '.claudinite-hooks.log'), 'utf8'); } catch { return ''; } };

// Exit 0, and stdout either empty or one JSON verdict for the event.
function assertOpen(r, event, label) {
  assert.equal(r.status, 0, `${label}: exit ${r.status}, stderr: ${r.stderr}`);
  if (r.stdout === '') return;
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { assert.fail(`${label}: stdout is not JSON: ${r.stdout}`); }
  assert.equal(parsed.hookSpecificOutput?.hookEventName, event, `${label}: ${r.stdout}`);
  assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
}

const PACK = (body = '') => `${body}export default {
  id: 'fixture-guest',
  ruleRoutingGuidance: { belongs: 'the fixture project only', excludes: 'anything portable' },
  detect: null, marker: null, prose: 'RULES.md', worldRules: [], workRules: [],
};
`;
const SKILL = [
  '---', 'name: fixture-guest-skill', 'description: A rehearsal fixture skill.', 'metadata:',
  '  force-load-on-tool-calls:', "    - 'Bash.command /\\bheld-cmd\\b/'",
  '  force-load-on-prompts-matching:', "    - '/\\bSHIPIT\\b/'",
  '  force-load-on-tool-results-matching:', "    - 'WebFetch /\\b403\\b/'",
  '---', '# fixture', '',
].join('\n');
const repo = ({ settings = JSON.stringify({ packs: ['local/fixture-guest'] }), pack = PACK() } = {}) => makeRepo({ changed: {
  '.claudinite-settings.json': settings,
  '.claudinite/local/packs/fixture-guest/pack.mjs': pack,
  '.claudinite/local/packs/fixture-guest/RULES.md': '# fixture-guest\n\nNo standing rules.\n',
  '.claudinite/local/packs/fixture-guest/skills/fixture-guest-skill/SKILL.md': SKILL,
} });
const PAYLOADS = {
  'pretooluse-command.mjs': { tool_name: 'Bash', tool_input: { command: 'held-cmd --now' } },
  'post-tool-use-command.mjs': { tool_name: 'WebFetch', tool_input: { url: 'https://x' }, tool_response: 'HTTP 403' },
  'user-prompt-submit-command.mjs': { prompt: 'SHIPIT now' },
};

test('no payload, a payload that is not JSON, and a payload of the wrong shape all end in exit 0 with nothing said', () => {
  const root = repo();
  try {
    for (const entry of ENTRIES) {
      for (const input of ['', 'not json {', '[]', '"str"', JSON.stringify({ tool_name: 7, prompt: 7 })]) {
        const r = run(entry, root, input);
        assert.equal(r.status, 0, `${entry} on ${JSON.stringify(input)}: ${r.stderr}`);
        assert.equal(r.stdout, '', `${entry} on ${JSON.stringify(input)}`);
      }
    }
  } finally { cleanup(root); }
});

test('input fields of the wrong type never crash a judge', () => {
  const root = repo();
  try {
    const odd = [
      { tool_name: 'Bash', tool_input: { command: 123 } },
      { tool_name: 'Bash', tool_input: 'a string' },
      { tool_name: 'Bash', tool_input: null },
      { tool_name: 'Edit', tool_input: { file_path: null } },
      { tool_name: 'Edit', tool_input: { file_path: 42 } },
      { tool_name: 'WebFetch', tool_input: {}, tool_response: 12345 },
      { tool_name: 'WebFetch', tool_input: {}, tool_response: null },
      { tool_name: 'Bash', tool_input: { command: 'ls' }, transcript_path: 42 },
      { tool_name: 'Bash', tool_input: { command: 'ls' }, transcript_path: root },
      { prompt: ['not', 'a', 'string'] },
      { prompt: 'SHIPIT', transcript_path: root },
    ];
    for (const entry of ENTRIES) {
      for (const payload of odd) assertOpen(run(entry, root, payload), EVENTS[entry], `${entry} on ${JSON.stringify(payload)}`);
    }
  } finally { cleanup(root); }
});

test('a settings file that is not JSON fails open on every entry, with the failure in the hook log', () => {
  const root = repo({ settings: '{ not json' });
  try {
    for (const entry of ENTRIES) {
      const r = run(entry, root, PAYLOADS[entry]);
      assert.equal(r.status, 0, `${entry}: ${r.stderr}`);
      assert.equal(r.stdout, '');
    }
    assert.match(hookLog(root), /done exit=0 (guard|hook)-failed/);
  } finally { cleanup(root); }
});

test('a pack whose import never settles trips the deadline: exit 0, nothing said, the deadline logged', () => {
  const root = repo({ pack: PACK('await new Promise(() => {});\n') });
  try {
    for (const entry of ENTRIES) {
      const started = Date.now();
      const r = run(entry, root, PAYLOADS[entry], { CLAUDINITE_HOOK_DEADLINE_MS: '400' });
      assert.equal(r.status, 0, `${entry}: ${r.stderr}`);
      assert.equal(r.stdout, '');
      assert.ok(Date.now() - started < 4000, `${entry} took ${Date.now() - started} ms`);
    }
    assert.match(hookLog(root), /done exit=0 deadline 400ms/);
  } finally { cleanup(root); }
});

test('a transcript path that is a directory still lets a trigger judge — the block is the deliberate exit 2, the nudges are context', () => {
  const root = repo();
  try {
    const held = run('pretooluse-command.mjs', root, { ...PAYLOADS['pretooluse-command.mjs'], transcript_path: root });
    assert.equal(held.status, 2);
    assert.match(held.stderr, /fixture-guest-skill/);
    for (const entry of ['post-tool-use-command.mjs', 'user-prompt-submit-command.mjs']) {
      const r = run(entry, root, { ...PAYLOADS[entry], transcript_path: root });
      assertOpen(r, EVENTS[entry], entry);
      assert.match(r.stdout, /fixture-guest-skill/);
    }
  } finally { cleanup(root); }
});

// The runner alone, driven by judges that misbehave in every way a judge can.
function runnerWith(event, canBlock, judgeSource, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-runner-'));
  const judge = join(dir, 'judge.mjs');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(judge, judgeSource);
  writeFileSync(entry, [
    `import { runHook } from ${JSON.stringify(join(HOOKS, 'hook-runner.mjs'))};`,
    `runHook(${JSON.stringify(event)}, { canBlock: ${canBlock}, load: () => import(${JSON.stringify(judge)}) });`,
  ].join('\n'));
  try { return spawn(entry, dir, JSON.stringify({ tool_name: 'X', tool_input: {} }), env); }
  finally { removeTree(dir); }
}

test('the runner: a block is exit 2 with the reason on stderr only where the event can block, else context', () => {
  const blocks = "export const judge = async () => ({ block: 'Blocked: no', reason: 'fixture' });";
  const pre = runnerWith('PreToolUse', true, blocks);
  assert.equal(pre.status, 2);
  assert.equal(pre.stderr, 'Blocked: no');
  assert.equal(pre.stdout, '');
  const post = runnerWith('PostToolUse', false, blocks);
  assertOpen(post, 'PostToolUse', 'block on PostToolUse');
  assert.equal(JSON.parse(post.stdout).hookSpecificOutput.additionalContext, 'Blocked: no');
});

test('the runner: context is one JSON verdict, nothing is an empty stdout', () => {
  const r = runnerWith('PostToolUse', false, "export const judge = async () => ({ context: 'a note' });");
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'a note' } });
  const none = runnerWith('PreToolUse', true, 'export const judge = async () => null;');
  assert.equal(none.status, 0);
  assert.equal(none.stdout, '');
});

test('the runner: a judge that throws, rejects, returns junk, hangs, or cannot be loaded — exit 0 every time', () => {
  const cases = {
    throws: "export const judge = () => { throw new Error('boom'); };",
    rejects: "export const judge = async () => { throw new Error('boom'); };",
    junk: 'export const judge = async () => 42;',
    junkBlock: 'export const judge = async () => ({ block: 42, context: { not: "a string" } });',
    hangs: 'export const judge = () => new Promise(() => {});',
    noJudge: 'export const other = 1;',
    brokenModule: 'this is not javascript (',
  };
  for (const [label, source] of Object.entries(cases)) {
    const r = runnerWith('PreToolUse', true, source, { CLAUDINITE_HOOK_DEADLINE_MS: '400' });
    assert.equal(r.status, 0, `${label}: exit ${r.status}, stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', label);
  }
});

test('the runner: a missing judge module is exit 0, not the module-not-found crash the harness would print on every call', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-runner-'));
  try {
    const entry = join(dir, 'entry.mjs');
    writeFileSync(entry, [
      `import { runHook } from ${JSON.stringify(join(HOOKS, 'hook-runner.mjs'))};`,
      "runHook('PostToolUse', { canBlock: false, load: () => import('./absent-judge.mjs') });",
    ].join('\n'));
    const r = spawn(entry, dir, JSON.stringify({ tool_name: 'X' }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.match(readFileSync(join(dir, '.claudinite-hooks.log'), 'utf8'), /hook-failed Cannot find module/);
  } finally { removeTree(dir); }
});

test('every per-call entry is the three-line runner call, so nothing but the runner can exit', () => {
  for (const entry of ENTRIES) {
    const text = readFileSync(join(HOOKS, entry), 'utf8');
    assert.match(text, /import \{ runHook \} from '\.\/hook-runner\.mjs';/, entry);
    assert.doesNotMatch(text, /process\.(exit|stdout|stderr|stdin)/, entry);
    assert.equal(text.match(/runHook\(/g).length, 1, entry);
  }
});
