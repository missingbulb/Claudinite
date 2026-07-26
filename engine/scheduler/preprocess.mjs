// The pre-agent preprocessing stage (agent-preprocessing DESIGN §3). The
// scheduler runs a task's declared `agent_preprocessing` command as a SUBPROCESS
// before any agent starts — deterministic code work, Action-side, over the one
// sanctioned non-MCP surface (the Action GITHUB_TOKEN, inherited in `env`) and
// the repo Actions secrets the task declared (§9, `resolveTaskSecrets` below).
//
// The subprocess is the scheduler's child, so its `agent_preprocessing_timeout`
// is a HARD kill: a manual timer SIGKILLs an overrun and the run is reported
// failed. Its cwd is the TASK directory, so a declared `node worker.mjs` resolves
// to the script beside task.mjs (the containment the contract enforces); the repo
// root and slot context are handed in via CLAUDINITE_* env so the worker can act
// on the whole repo. Nothing the subprocess prints is threaded into the agent —
// preprocessing communicates only through the repository (DESIGN §3).

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run `command` as a subprocess bounded by `timeoutSeconds`. Resolves (never
// rejects) with { ok, timedOut, code, signal, stdout, stderr }: `ok` is a clean
// zero exit that did not time out. `taskDir` is the cwd; `env` is the full
// environment the child inherits (the caller injects GITHUB_TOKEN + CLAUDINITE_*).
export function runPreprocessing(command, { taskDir, env, timeoutSeconds }) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: taskDir, env, shell: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL'); // the hard kill — no grace period past the declared bound
    }, timeoutSeconds * 1000);

    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    // A spawn error (command not found, etc.) is a failure, not a throw.
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, timedOut, code: null, signal: null, stdout, stderr: `${stderr}${e.message}` });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, timedOut, code, signal, stdout, stderr });
    });
  });
}

// The conditional-handoff signal (agent-preprocessing DESIGN §3, E4). A task with
// BOTH agent_preprocessing AND a non-`none` agent_model hands off to the agent
// ONLY when its worker requests it — so a task can absorb its work into
// preprocessing and be AGENTLESS on the quiet nights. The scheduler hands the
// worker this path via CLAUDINITE_REQUEST_AGENT and files `ready-for-agent` iff
// the worker created it. It is a pure control signal: the worker communicates
// DATA to the agent only through the repository, never through this file (DESIGN
// §3, "no code→agent data channel").
export function agentRequestPath({ pack, task, slotId }) {
  return join(tmpdir(), `claudinite-request-agent-${pack}-${task}-${slotId}`);
}
export function clearAgentRequest(path) { try { rmSync(path, { force: true }); } catch { /* nothing to clear */ } }
export function agentRequested(path) { return existsSync(path); }

// --- task-declared repo secrets (agent-preprocessing DESIGN §9) --------------
// The scheduler workflow hands the engine the WHOLE repo secrets bundle as JSON
// (`CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}` — Actions has no way to select
// secrets dynamically). The engine never passes that bundle on: it resolves the
// names a task DECLARED and hands the worker only those, so a worker's ambient
// authority is exactly its `agent_preprocessing_secrets` list.
export const SECRETS_BUNDLE_VAR = 'CLAUDINITE_SECRETS';

// Parse the bundle. A missing/blank/malformed value is an empty bundle — the
// caller reports the resulting `missing` names, which is the actionable failure
// ("secret X is not configured"), not a parse error nobody can act on.
export function parseSecretsBundle(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

// Resolve a task's declared secret names against the bundle.
// Returns { env, missing }: `env` maps each PRESENT name to its value, `missing`
// lists the declared names this repo has not configured (an empty-string secret
// counts as missing — GitHub returns "" for an unset name in `toJSON(secrets)`).
export function resolveTaskSecrets(declared, bundleRaw) {
  const bundle = parseSecretsBundle(bundleRaw);
  const env = {};
  const missing = [];
  for (const name of declared ?? []) {
    const value = bundle[name];
    if (typeof value === 'string' && value !== '') env[name] = value;
    else missing.push(name);
  }
  return { env, missing };
}

// The environment a preprocessing subprocess actually gets: the scheduler's own
// env MINUS the secrets bundle (a worker must never see secrets it did not
// declare), plus the CLAUDINITE_* context and the task's resolved secrets.
export function preprocessingEnv(parentEnv, context, secretEnv = {}) {
  const { [SECRETS_BUNDLE_VAR]: _bundle, ...rest } = parentEnv;
  return { ...rest, ...context, ...secretEnv };
}

// A one-line reason for the job summary / an issue comment when preprocessing
// fails — distinguishing a timeout kill from a non-zero exit.
export function preprocessingFailure(result) {
  if (result.timedOut) return 'preprocessing exceeded its agent_preprocessing_timeout and was killed';
  if (result.code !== null) return `preprocessing exited ${result.code}`;
  return `preprocessing could not run: ${result.stderr.trim().split('\n').pop() || 'unknown error'}`;
}
