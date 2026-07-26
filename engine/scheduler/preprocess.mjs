// The pre-agent preprocessing stage (agent-preprocessing DESIGN §3). The
// scheduler runs a task's declared `agent_preprocessing` command as a SUBPROCESS
// before any agent starts — deterministic code work, Action-side, over the one
// sanctioned non-MCP surface (the Action GITHUB_TOKEN, inherited in `env`) and
// the repo's Actions secrets, unpacked into its env (§9, `preprocessingEnv` below).
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

// --- repo secrets for a worker (agent-preprocessing DESIGN §9) ---------------
// The scheduler workflow hands the engine the repo's secrets as one JSON blob
// (`CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}` — Actions has no way to name
// secrets dynamically). Unpacking it into the worker's env is all there is to
// delivery: a task's `required_secrets` says which ones it NEEDS CONFIGURED (the
// declaration that drives the adoption/scheduler ask), not which ones it is
// permitted to read. Workers are tracked, reviewed code holding the Action
// GITHUB_TOKEN already, so a permission boundary between them would be
// ceremony — the honest boundary is the repo's own secret list.
export const SECRETS_BUNDLE_VAR = 'CLAUDINITE_SECRETS';

// Parse the bundle. Missing/blank/malformed reads as empty — a repo with no
// secrets is the ordinary case, not an error.
export function parseSecretsBundle(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

// The environment a preprocessing subprocess gets: the scheduler's own env with
// the raw bundle REPLACED by the secrets it carried, plus the CLAUDINITE_*
// context. (Replaced, not added alongside — a worker has no use for the blob,
// and leaving it in invites a worker to parse it instead of reading a name.)
// An unset secret renders as "" in `toJSON(secrets)`; those are dropped so a
// worker's `if (!process.env.X)` guard behaves.
export function preprocessingEnv(parentEnv, context) {
  const { [SECRETS_BUNDLE_VAR]: bundleRaw, ...rest } = parentEnv;
  const secrets = Object.fromEntries(
    Object.entries(parseSecretsBundle(bundleRaw)).filter(([, v]) => typeof v === 'string' && v !== ''),
  );
  return { ...rest, ...secrets, ...context };
}

// A one-line reason for the job summary / an issue comment when preprocessing
// fails — distinguishing a timeout kill from a non-zero exit.
export function preprocessingFailure(result) {
  if (result.timedOut) return 'preprocessing exceeded its agent_preprocessing_timeout and was killed';
  if (result.code !== null) return `preprocessing exited ${result.code}`;
  return `preprocessing could not run: ${result.stderr.trim().split('\n').pop() || 'unknown error'}`;
}
