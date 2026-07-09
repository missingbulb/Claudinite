#!/usr/bin/env node
// Environment requirements — a pack declares a toolchain (or per-repo deps) a
// cloud session needs but the base image doesn't ship, via an optional `env`
// field on its pack.mjs. Three dependency-free entry points, all driven by the
// repo's ACTIVE packs and the per-pack parameters it supplies in
// .claudinite-checks.json ("packConfig"):
//
//   node env.mjs install   Run every active pack's `setup` in the checkout and
//                          stamp the aggregate version flag. This is what the
//                          project's ONE generic environment-setup script calls
//                          (after syncing the corpus). The flag lives in the
//                          cached filesystem outside the checkout, so install
//                          runs ~once per environment image.
//   node env.mjs check     SessionStart assertion (web only): probe every active
//                          requirement and compare the version flag; emit the
//                          halt-gate context if anything is missing or stale.
//                          Never installs.
//   node env.mjs plan      Print what install would run (review / debug).
//
// A pack's declaration — `setup` and `probe` may be a string, or a function of
// the project's per-pack params (so a repo can say WHERE its package.json is):
//   env: {
//     label: 'Node dependencies',
//     version: 1,
//     setup: (p) => (p.dirs ?? ['.']).map((d) => `( cd "${d}" && npm ci )`).join('\n'),
//     probe: (p) => (p.dirs ?? ['.']).map((d) => `[ -d "${d}/node_modules" ]`).join(' && '),
//   }
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadPacks, isActive } from './registry.mjs';
import { loadConfig } from '../checks/lib/context.mjs';

// The version flag lives OUTSIDE the checkout (re-cloned per container) but
// inside the environment's cached filesystem — the checkout's parent — so it
// persists across sessions like the installed toolchains do.
export const flagPath = (projectRoot) =>
  resolve(projectRoot, '..', '.claudinite-environment-version');

const resolveField = (field, params) =>
  typeof field === 'function' ? field(params) : field;

/**
 * The env declarations of a repo's active packs, each resolved against the
 * project's per-pack params (.claudinite-checks.json "packConfig").
 */
export async function activeEnvs(projectRoot, { packs, config } = {}) {
  config ??= loadConfig(projectRoot);
  packs ??= await loadPacks();
  return packs
    .filter((p) => p.env && isActive(p, config))
    .map((p) => {
      const params = (config.packConfig && config.packConfig[p.id]) || {};
      return {
        id: p.id,
        label: p.env.label ?? p.id,
        version: p.env.version ?? 0,
        setup: resolveField(p.env.setup, params),
        probe: resolveField(p.env.probe, params),
      };
    });
}

/** Combined version — any change to an active pack's env (id/version) invalidates. */
export function aggregateVersion(envs) {
  const basis = envs.map((e) => `${e.id}:${e.version ?? 0}`).sort().join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 12);
}

/**
 * Pure decision: which requirements are unmet. `probe(env) -> bool` reports
 * whether a requirement is present; `actualFlag` is the recorded version (or
 * null). Returns human-readable problems, empty when the environment is good.
 */
export function evaluate(envs, { probe, actualFlag }) {
  const problems = [];
  for (const e of envs) {
    if (!probe(e)) problems.push(`${e.label} is not installed`);
  }
  if (!problems.length && envs.length) {
    const expected = aggregateVersion(envs);
    if (actualFlag == null || actualFlag === '') {
      problems.push('the environment setup script has not been applied (no version flag on disk)');
    } else if (actualFlag !== expected) {
      problems.push(`the environment setup script is out of date (environment is ${actualFlag}, packs expect ${expected})`);
    }
  }
  return problems;
}

const runBash = (script, cwd, opts = {}) =>
  spawnSync('bash', ['-c', script], { cwd, encoding: 'utf8', ...opts });

// --- install (runs once at environment-image build) ---------------------
async function install(projectRoot) {
  const envs = await activeEnvs(projectRoot);
  for (const e of envs) {
    process.stdout.write(`\n=== ${e.label} (pack: ${e.id}) ===\n`);
    // Fragments own their own softness (`|| true` on transient steps); a hard
    // failure is logged but does not abort the rest — `check`'s probe is the
    // real gate, so a partial install still stamps and gets caught at session
    // start if a tool is genuinely absent.
    const r = spawnSync('bash', ['-c', e.setup], { cwd: projectRoot, stdio: 'inherit' });
    if (r.status !== 0) {
      process.stderr.write(`Claudinite env: "${e.label}" setup exited ${r.status} (continuing).\n`);
    }
  }
  writeFileSync(flagPath(projectRoot), `${aggregateVersion(envs)}\n`);
  process.stdout.write(
    `\nClaudinite env: applied ${envs.length} requirement(s); stamped ${flagPath(projectRoot)}.\n`
  );
}

// --- check (SessionStart assertion) -------------------------------------
function emitAlert(problems) {
  const msg =
    `Environment setup check failed: ${problems.join('; ')}. Alert the user: copy the full body of ` +
    '.claude/environment-setup.sh into the Claude Code Web environment Setup script field (environment ' +
    'settings), then start a fresh session so the snapshot rebuilds with the prerequisites installed.';
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } })}\n`
  );
}

async function check(projectRoot) {
  // Web only — locally the developer installs toolchains directly.
  if (process.env.CLAUDE_CODE_REMOTE !== 'true') return;
  const envs = await activeEnvs(projectRoot);
  if (!envs.length) return;
  let actualFlag = null;
  try { actualFlag = readFileSync(flagPath(projectRoot), 'utf8').trim(); } catch { /* not applied */ }
  const problems = evaluate(envs, {
    probe: (e) => runBash(e.probe, projectRoot).status === 0,
    actualFlag,
  });
  if (problems.length) emitAlert(problems);
}

// --- plan (dry-run preview) ---------------------------------------------
async function plan(projectRoot) {
  const envs = await activeEnvs(projectRoot);
  for (const e of envs) {
    process.stdout.write(`# ${e.label} (pack: ${e.id}, v${e.version})\n${e.setup}\n\n`);
  }
  process.stdout.write(`# aggregate version: ${aggregateVersion(envs)}\n`);
}

// CLI — but importable (the tests import the pure helpers above).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const cmd = process.argv[2];
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (cmd === 'install') {
    await install(projectRoot);
  } else if (cmd === 'check') {
    await check(projectRoot); // fails soft — a SessionStart hook must never crash the session
  } else if (cmd === 'plan') {
    await plan(projectRoot);
  } else {
    process.stderr.write('usage: env.mjs <install|check|plan>\n');
    process.exit(2);
  }
}
