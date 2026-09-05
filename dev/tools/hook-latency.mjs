#!/usr/bin/env node
// Wall-clock of each per-call hook, spawned exactly as Claude Code spawns it —
// `node <entry>` with the JSON payload on stdin — over the payloads a session
// sends most: a call no declaration names, a guarded call, an edit under a
// scoped path, a result, a prompt. Run it before and after any change to
// engine/hooks/ and read the two tables against each other; the retrospective
// brief in docs/declarative-checks/DESIGN.md records the budget.
//
//   node dev/tools/hook-latency.mjs [treeRoot=.] [transcript|-] [iterations=10]
//
// `transcript` is a session JSONL to hand every call (a large one shows what a
// trigger hit costs on a long session); `-` hands none. The hooks' cache under
// the OS temp dir is dropped first, so the first row includes one registry
// load and every later row reads the cache — the two paths a session sees.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rootArg = '.', transcript = '-', itersArg = '10'] = process.argv.slice(2);
const root = resolve(rootArg);
const iters = Number(itersArg);
const tp = transcript === '-' ? '/nonexistent/transcript.jsonl' : resolve(transcript);
const { cacheFile } = await import(join(root, 'engine', 'hooks', 'hook-context.mjs'));
rmSync(cacheFile(root), { force: true });

const hooks = {
  pre: join(root, 'engine/hooks/pretooluse-command.mjs'),
  post: join(root, 'engine/hooks/post-tool-use-command.mjs'),
  prompt: join(root, 'engine/hooks/user-prompt-submit-command.mjs'),
};
const cases = [
  ['pre', 'Read (no declaration)', { tool_name: 'Read', tool_input: { file_path: `${root}/README.md` } }],
  ['pre', 'Bash plain', { tool_name: 'Bash', tool_input: { command: 'ls -la' } }],
  ['pre', 'Bash held (git commit)', { tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }],
  ['pre', 'Edit under a scoped path', { tool_name: 'Edit', tool_input: { file_path: `${root}/packs/basics/RULES.md` } }],
  ['pre', 'mcp tool', { tool_name: 'mcp__github__issue_read', tool_input: { method: 'get' } }],
  ['post', 'Bash result', { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'ok', stderr: '' } }],
  ['prompt', 'prompt', { prompt: 'please explain the design' }],
];
console.log(`tree ${root}\ntranscript ${transcript === '-' ? 'none' : tp}\n`);
console.log(`${'hook'.padEnd(6)} ${'payload'.padEnd(26)} ${'min'.padStart(6)} ${'p50'.padStart(6)} ${'max'.padStart(6)}  exit`);
for (const [kind, label, payload] of cases) {
  if (!existsSync(hooks[kind])) { console.log(`${kind.padEnd(6)} ${label.padEnd(26)} (no such hook in this tree)`); continue; }
  const times = [];
  const codes = new Set();
  for (let i = 0; i < iters; i += 1) {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [hooks[kind]], {
      input: JSON.stringify({ ...payload, transcript_path: tp, cwd: root, session_id: 'bench' }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
    });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    codes.add(r.status);
  }
  times.sort((a, b) => a - b);
  const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(0);
  console.log(`${kind.padEnd(6)} ${label.padEnd(26)} ${at(0).padStart(6)} ${at(0.5).padStart(6)} ${at(1).padStart(6)}  ${[...codes].join('/')}`);
}
