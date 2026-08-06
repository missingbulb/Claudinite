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
//
// THE LOG IS NOT THAT CHANNEL. The child's output is ECHOED to the scheduler's own
// stdout/stderr as it arrives, so the Action log carries what the worker actually
// did. That is an observability decision, not a data channel: no agent reads the
// log, and §3's "communicate only through the repository" is untouched. It is echoed
// LIVE rather than dumped at exit for the case that needs it most — a worker SIGKILLed
// at its timeout, whose buffered output would otherwise die with it. Before this,
// a failed worker surfaced as a bare `preprocessing exited 1` plus a three-line
// stderr tail in an issue, and diagnosing one meant reproducing it by hand.

import { spawn } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run `command` as a subprocess bounded by `timeoutSeconds`. Resolves (never
// rejects) with { ok, timedOut, code, signal, stdout, stderr }: `ok` is a clean
// zero exit that did not time out. `taskDir` is the cwd; `env` is the full
// environment the child inherits (the caller injects GITHUB_TOKEN + CLAUDINITE_*).
// `echo` (default on) mirrors the child's output to this process as it arrives —
// injected rather than hardcoded so a test can capture it instead of polluting the
// test runner's own output.
export function runPreprocessing(command, {
  taskDir, env, timeoutSeconds,
  echo = (chunk, stream) => (stream === 'stderr' ? process.stderr : process.stdout).write(chunk),
}) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: taskDir, env, shell: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // Echo is best-effort: a worker's output must never be the thing that fails the
    // run, so a broken sink is swallowed rather than propagated.
    const mirror = (chunk, stream) => { try { echo?.(String(chunk), stream); } catch { /* the run matters, the echo does not */ } };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL'); // the hard kill — no grace period past the declared bound
    }, timeoutSeconds * 1000);

    child.stdout?.on('data', (d) => { stdout += d; mirror(d, 'stdout'); });
    child.stderr?.on('data', (d) => { stderr += d; mirror(d, 'stderr'); });
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

// …AND the artifacts that request refers to. A worker that opened a branch or a PR
// writes them here as JSON, and the scheduler records them verbatim in the dispatch
// issue, which is where the agent reads them.
//
// This is the ONE thing that crosses the code→agent boundary as data, and it is
// deliberate (owner, 2026-08-06). §3 originally allowed none, so an agent had to
// REDISCOVER what preprocessing had made — in practice by searching for a branch or PR
// whose name matched a convention. That is a silent-error generator: a search that finds
// nothing is indistinguishable from nothing having been created, and the agent believes
// it. It cost a whole day on missingbulb/Sheepdog, where the maintenance PR had been
// opened AND merged in the same run, the agent searched for an open one, found none, and
// correctly-by-its-instructions concluded the cycle had delivered nothing.
//
// Identity, not names: what the issue carries is a PR NUMBER and a branch REF that the
// creating process actually used. The rule that follows is absolute and belongs in every
// agent's instructions — **if the issue names no artifact, none exists**. No falling back
// to a search, because the fallback is the bug.
//
// Anything else about the work still travels through the repository (§3 otherwise
// stands): this channel carries identifiers for what this run made, never findings,
// never instructions.
export function readAgentRequest(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return {};
  // A pre-payload worker writes the bare marker line. Not an error — it requested the
  // agent and named no artifacts, which reads as "nothing delivered", exactly as if the
  // field were absent.
  try { return JSON.parse(raw); } catch { return {}; }
}

// A one-line reason for the job summary / an issue comment when preprocessing
// fails — distinguishing a timeout kill from a non-zero exit.
export function preprocessingFailure(result) {
  if (result.timedOut) return 'preprocessing exceeded its agent_preprocessing_timeout and was killed';
  if (result.code !== null) return `preprocessing exited ${result.code}`;
  return `preprocessing could not run: ${result.stderr.trim().split('\n').pop() || 'unknown error'}`;
}
