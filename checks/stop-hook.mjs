#!/usr/bin/env node
// Claude Code Stop hook: run the conformance checks on what the session changed
// and block the stop (exit 2) while blocking findings remain, feeding them back
// into the session. Registered per-repo — see bootstrap.md.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const runner = join(dirname(fileURLToPath(import.meta.url)), 'run.mjs');

const git = (...a) => spawnSync('git', a, { cwd: projectRoot, encoding: 'utf8' });

// Fast path: nothing changed vs the base and the tree is clean → stay silent.
const status = git('status', '--porcelain');
let dirty = status.status === 0 && status.stdout.trim() !== '';
if (!dirty) {
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    const mb = git('merge-base', 'HEAD', ref);
    if (mb.status !== 0) continue;
    dirty = git('rev-parse', 'HEAD').stdout.trim() !== mb.stdout.trim();
    break;
  }
}
if (!dirty) process.exit(0);

const run = spawnSync(process.execPath, [runner, '--changed'], {
  cwd: projectRoot, encoding: 'utf8',
});
if (run.status === 0) {
  if (run.stdout.trim()) console.log(run.stdout.trim()); // advisory findings, for the transcript
  process.exit(0);
}

// Self-limiting loop guard: after blocking twice on the *same* findings, let the
// stop through rather than trapping a session that can't converge.
const hash = createHash('sha256').update(run.stdout).digest('hex').slice(0, 16);
const stateFile = join(
  tmpdir(),
  `claudinite-stop-${createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}.json`
);
let state = { hash: '', count: 0 };
if (existsSync(stateFile)) {
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* stale state resets below */ }
}
const count = state.hash === hash ? state.count + 1 : 1;
writeFileSync(stateFile, JSON.stringify({ hash, count }));
if (count > 2) {
  console.log('claudinite checks: the same blocking findings survived 2 fix attempts — letting the stop through. Run `node ' + runner + ' --changed` to see them.');
  process.exit(0);
}

process.stderr.write(
  'Claudinite conformance checks failed — fix these findings now, in this session:\n\n' + run.stdout
);
process.exit(2);
