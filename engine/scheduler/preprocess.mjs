// The pre-agent preprocessing stage (agent-preprocessing DESIGN §3). The
// scheduler runs a task's declared `agent_preprocessing` command as a SUBPROCESS
// before any agent starts — deterministic code work, Action-side, over the one
// sanctioned non-MCP surface (the Action GITHUB_TOKEN, inherited in `env`).
//
// The subprocess is the scheduler's child, so its `agent_preprocessing_timeout`
// is a HARD kill: a manual timer SIGKILLs an overrun and the run is reported
// failed. Its cwd is the TASK directory, so a declared `node worker.mjs` resolves
// to the script beside task.mjs (the containment the contract enforces); the repo
// root and slot context are handed in via CLAUDINITE_* env so the worker can act
// on the whole repo. Nothing the subprocess prints is threaded into the agent —
// preprocessing communicates only through the repository (DESIGN §3).

import { spawn } from 'node:child_process';

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

// A one-line reason for the job summary / an issue comment when preprocessing
// fails — distinguishing a timeout kill from a non-zero exit.
export function preprocessingFailure(result) {
  if (result.timedOut) return 'preprocessing exceeded its agent_preprocessing_timeout and was killed';
  if (result.code !== null) return `preprocessing exited ${result.code}`;
  return `preprocessing could not run: ${result.stderr.trim().split('\n').pop() || 'unknown error'}`;
}
