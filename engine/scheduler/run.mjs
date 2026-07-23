// The scheduler entrypoint's orchestration core (per-project-scheduling DESIGN
// §3). The vendored hourly Action runs this: decide due slots from the run
// ledger, discover active tasks, collect only the signals the due tasks declare,
// run each precondition, and either dispatch agent work as a `ready-for-agent`
// issue or (for `agent_model: none`) run the worker inline.
//
// This module is the DECISION core, kept injectable so it tests with fakes: the
// GitHub I/O (the Actions run-ledger read for `lastSuccess`, the signal
// collectors, the issue search/create) is supplied by the thin CLI shell around
// `planRun`. The "should this run" verdict is always code here — never the
// shell's judgment (the same split the fleet planner uses).

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dueSlots } from './slots.mjs';
import { planDispatch, dispatchTitle, dispatchBody, DISPATCH_PREFIX, READY_LABEL, NEEDS_HUMAN_LABEL, SCHEDULER_LABELS } from './dispatch.mjs';
import { isAgentless } from './model-map.mjs';
import { runPreprocessing, preprocessingFailure } from './preprocess.mjs';

// The due tasks, each paired with the slot it runs under. Union the discovered
// tasks' frequencies, ask slots which are due (run-ledger math), then map due
// frequencies back to their tasks. A task whose frequency isn't due drops out.
export function computeDueTaskSlots(tasks, schedule, now, lastSuccess) {
  const frequencies = [...new Set(tasks.map((t) => t.decl.frequency))];
  const due = new Map(dueSlots(frequencies, schedule, now, lastSuccess).map((d) => [d.frequency, d]));
  const out = [];
  for (const task of tasks) {
    const slot = due.get(task.decl.frequency);
    if (slot) out.push({ task, slotId: slot.slotId, slotTime: slot.slotTime });
  }
  return out;
}

// The union of signal names the due tasks declare — the scheduler collects only
// these, so a non-daily slot never pays for daily tasks' signals (DESIGN §3.3).
export function signalsUnion(dueTaskSlots) {
  const names = new Set();
  for (const { task } of dueTaskSlots) for (const name of task.decl.precondition_signals) names.add(name);
  return [...names];
}

// The signal-collection lookback: the widest due task's period plus 1h slack
// (DESIGN §3.3). Stateless fixed lookback — overlap is absorbed by dedupe.
const FREQUENCY_MS = {
  hourly: 3600e3, 'daily-2h': 86400e3, 'daily-1h': 86400e3, daily: 86400e3,
  'daily+1h': 86400e3, weekly: 7 * 86400e3, monthly: 31 * 86400e3,
};
export function windowStart(dueTaskSlots, now) {
  const widest = Math.max(0, ...dueTaskSlots.map(({ task }) => FREQUENCY_MS[task.decl.frequency] ?? 86400e3));
  return new Date(new Date(now).getTime() - widest - 3600e3).toISOString();
}

// Run one task's precondition in isolation (DESIGN §3.4). A throwing
// precondition converges to a skip with the error recorded — it never sinks the
// rest of the run; the CLI escalates a thrown precondition to a workflow-failure
// issue separately.
export function runPrecondition(task, signals, packConfig) {
  try {
    const v = task.decl.precondition(signals, packConfig) ?? {};
    return {
      run: v.run === true,
      reason: v.reason ?? '',
      context: Array.isArray(v.context) ? v.context : [],
    };
  } catch (e) {
    return { run: false, reason: `precondition threw: ${e.message}`, context: [], error: e.message };
  }
}

// A human-readable job-summary line per evaluated task — the observability the
// old plan.json gave (DESIGN §3.6).
export function renderSummary(evaluations) {
  return evaluations.map((e) => {
    const verb = !e.run ? 'skip' : e.inline ? 'run-inline' : e.dispatch?.action ?? 'run';
    return `- ${e.pack}/${e.task} [${e.slotId}] ${verb} — ${e.reason || e.dispatch?.reason || ''}`.trimEnd();
  }).join('\n');
}

// Orchestrate one scheduler run into a set of decisions — the reusable core the
// CLI wraps with real GitHub I/O. Injected seams:
//   collectSignals(names) -> signals object (the declared union, collected once)
//   packConfigFor(packId) -> that pack's entry config from .claudinite-checks.json
//   existingIssuesFor(pack, task) -> the task family's issues [{number,title,state}]
// Returns `{ evaluations }`: one record per due task with its precondition
// verdict and, when it runs, either an inline marker (agent_model: none) or a
// dispatch decision (planDispatch).
export async function planRun({
  tasks, schedule, now, lastSuccess,
  collectSignals, packConfigFor = () => ({}), existingIssuesFor = async () => [],
}) {
  const dueList = computeDueTaskSlots(tasks, schedule, now, lastSuccess);
  const signals = await collectSignals(signalsUnion(dueList));

  const evaluations = [];
  for (const { task, slotId } of dueList) {
    const pre = runPrecondition(task, signals, packConfigFor(task.pack));
    const rec = {
      pack: task.pack, task: task.id, slotId,
      model: task.decl.agent_model, outcome: task.decl.expected_outcome,
      run: pre.run, reason: pre.reason, context: pre.context,
    };
    if (pre.error) rec.error = pre.error;
    if (pre.run) {
      // A declared agent_preprocessing runs as a subprocess BEFORE any agent
      // (DESIGN §3) — flagged here (pure) for the summary; the CLI shell executes
      // it. An agentless task is preprocessing-only; an agentful one hands off to
      // the agent after preprocessing succeeds.
      if (task.decl.agent_preprocessing) rec.preprocessing = true;
      if (isAgentless(task.decl.agent_model)) {
        // agent_model: none — no agent and no dispatch issue on success. A task with
        // no preprocessing runs the legacy inline worker; with preprocessing it is
        // the subprocess above.
        rec.inline = true;
      } else {
        const existing = await existingIssuesFor(task.pack, task.id);
        rec.dispatch = planDispatch({ existing, pack: task.pack, task: task.id, slotId });
      }
    }
    evaluations.push(rec);
  }
  return { evaluations };
}

// --- CLI: the thin I/O shell the vendored workflow invokes -------------------
// Wires the run-ledger read, signal collectors, and issue I/O around planRun,
// then acts on each decision (file a labeled dispatch issue, or run an inline
// worker) and prints the job summary. All GitHub access here is the Action's
// GITHUB_TOKEN — the one sanctioned non-MCP surface (DESIGN §10).

// The task family's issues (state=all) via the search API, filtered to exact
// prefix — the input planDispatch's exactly-once / at-most-one-open guards read.
async function existingIssuesViaSearch(gh, repo, pack, task) {
  const q = encodeURIComponent(`repo:${repo} in:title "${DISPATCH_PREFIX} ${pack}/${task}"`);
  const { status, json } = await gh(`/search/issues?q=${q}&per_page=100`);
  if (status !== 200 || !Array.isArray(json?.items)) return [];
  const prefix = `${DISPATCH_PREFIX} ${pack}/${task} `;
  return json.items
    .filter((i) => `${(i.title ?? '').trim()} `.startsWith(prefix))
    .map((i) => ({ number: i.number, title: i.title, state: i.state }));
}

// Ensure the dispatch labels exist before any is applied — GitHub 422s when you
// apply an unknown label (it never creates one on demand), so the scheduler, as the
// thing that assigns them, guarantees them here. Idempotent (201 created / 422 already
// exists are both success) and self-healing (a deleted label reappears next run), which
// is why no separate one-off label-creation step is needed. Exported for the run tests.
export async function ensureLabels(gh, repo, labels) {
  for (const { name, color, description } of labels) {
    const res = await gh(`/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
    if (res.status !== 201 && res.status !== 422) {
      console.log(`! could not ensure label "${name}": ${res.status}`);
    }
  }
}

async function main() {
  const { makeGh, lastSuccessTime, actionRepoContext } = await import('./signals/gh.mjs');
  const { collectSignals } = await import('./signals/index.mjs');
  const { discoverTasks } = await import('./discover.mjs');
  const { loadConfig } = await import('../checks/helpers/repo-context.mjs');

  const root = process.cwd();
  const { repo, defaultBranch } = actionRepoContext();
  if (!repo) { console.error('GITHUB_REPOSITORY not set — not in an Actions context'); process.exit(1); }
  const gh = makeGh();
  const config = loadConfig(root);

  const { tasks, errors } = await discoverTasks(root, config);
  for (const e of errors) console.log(`! ${e.what}`);

  const now = new Date();
  const lastSuccess = await lastSuccessTime(gh, repo);
  const schedule = config.taskScheduler;

  const due = computeDueTaskSlots(tasks, schedule, now, lastSuccess);
  const sinceIso = windowStart(due, now);
  const ctx = {
    repo, defaultBranch, now: now.toISOString(), sinceIso, config,
    activePacks: config.packs,
  };
  const packConfigFor = (packId) => config.packConfig?.[packId] ?? {};

  const { evaluations } = await planRun({
    tasks, schedule, now, lastSuccess,
    collectSignals: (names) => collectSignals(gh, ctx, names),
    packConfigFor,
    existingIssuesFor: (pack, task) => existingIssuesViaSearch(gh, repo, pack, task),
  });

  // Guarantee the dispatch labels exist before we file any labeled issue — when a
  // task will dispatch OR will run preprocessing (which may converge to
  // needs-human). An idle run pays nothing.
  if (evaluations.some((r) => r.run && (r.preprocessing || (!r.inline && r.dispatch?.action === 'create')))) {
    await ensureLabels(gh, repo, SCHEDULER_LABELS);
  }

  // File the labeled hand-off issue the executor runs (READY_LABEL): first line is
  // the task path, body carries the precondition's binding Context (dispatch.mjs).
  const fileHandoff = async (rec, taskObj) => {
    const title = dispatchTitle({ pack: rec.pack, task: rec.task, slotId: rec.slotId });
    const body = dispatchBody({ taskPath: taskObj.taskPath, pack: rec.pack, task: rec.task, slotId: rec.slotId, context: rec.context });
    const res = await gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels: [READY_LABEL] } });
    if (res.status >= 300) console.log(`! failed to file dispatch issue for ${rec.pack}/${rec.task}: ${res.status}`);
  };

  // Converge a failed preprocessing run to a single open needs-human issue for the
  // family — at-most-one-open, so a repeatedly-failing task never spams issues.
  const fileNeedsHuman = async (rec, why, extra) => {
    const existing = await existingIssuesViaSearch(gh, repo, rec.pack, rec.task);
    if (existing.some((i) => i.state === 'open')) {
      console.log(`  (an open dispatch issue already covers ${rec.pack}/${rec.task} — not filing another)`);
      return;
    }
    const title = dispatchTitle({ pack: rec.pack, task: rec.task, slotId: rec.slotId });
    const body = [
      `Preprocessing for \`${rec.pack}/${rec.task}\` (slot \`${rec.slotId}\`) failed and needs human triage.`,
      '', `- ${why}`, ...extra.map((e) => `- ${e}`),
    ].join('\n') + '\n';
    const res = await gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels: [NEEDS_HUMAN_LABEL] } });
    if (res.status >= 300) console.log(`! failed to file needs-human issue for ${rec.pack}/${rec.task}: ${res.status}`);
  };

  for (const rec of evaluations) {
    if (!rec.run) continue;
    const taskObj = tasks.find((t) => t.pack === rec.pack && t.id === rec.task);
    const decl = taskObj.decl;

    // Stage 1 — preprocessing (DESIGN §3): run the declared command as a subprocess
    // bounded by its timeout, before any agent. Its cwd is the task dir; the repo
    // root + slot context ride in via CLAUDINITE_* env.
    if (rec.preprocessing) {
      const result = await runPreprocessing(decl.agent_preprocessing, {
        taskDir: taskObj.taskDir,
        env: {
          ...process.env,
          CLAUDINITE_REPO_ROOT: root,
          CLAUDINITE_REPO: repo,
          CLAUDINITE_DEFAULT_BRANCH: defaultBranch ?? '',
          CLAUDINITE_SLOT_ID: rec.slotId,
          CLAUDINITE_PACK: rec.pack,
          CLAUDINITE_TASK: rec.task,
        },
        timeoutSeconds: decl.agent_preprocessing_timeout,
      });
      rec.preprocessResult = { ok: result.ok, timedOut: result.timedOut, code: result.code };
      if (!result.ok) {
        const why = preprocessingFailure(result);
        console.log(`! preprocessing ${rec.pack}/${rec.task} [${rec.slotId}]: ${why}`);
        const extra = result.stderr?.trim() ? [`stderr tail: ${result.stderr.trim().split('\n').slice(-3).join(' / ')}`] : [];
        await fileNeedsHuman(rec, why, extra);
        continue; // never hand off to an agent after a failed preprocessing
      }
      // Success. An agentless task is done (no issue on success, as the old inline
      // was quiet); an agentful one hands off to the agent now.
      console.log(`preprocessing ${rec.pack}/${rec.task} [${rec.slotId}]: ok`);
      if (rec.inline) continue;
      if (rec.dispatch?.action === 'create') await fileHandoff(rec, taskObj);
      continue;
    }

    // No preprocessing. agent_model:none → the legacy in-process inline worker.
    if (rec.inline) {
      try {
        const workerUrl = pathToFileURL(join(taskObj.taskDir, decl.agent_instructions)).href;
        const worker = (await import(workerUrl)).default;
        if (typeof worker === 'function') await worker({ gh, repo, ctx, slotId: rec.slotId });
      } catch (e) { console.log(`! inline worker ${rec.pack}/${rec.task} failed: ${e.message}`); }
      continue;
    }
    // Agent task with no preprocessing → today's immediate labeled dispatch.
    if (rec.dispatch?.action === 'create') await fileHandoff(rec, taskObj);
  }

  console.log('## Claudinite scheduler\n');
  console.log(renderSummary(evaluations) || '- no tasks due');
}

// Run only when invoked directly (the workflow's `node run.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
