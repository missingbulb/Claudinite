// The scheduler entrypoint's orchestration core (per-project-scheduling DESIGN
// §3). The vendored hourly Action runs this: decide due slots from the run
// ledger, discover active tasks, collect only the signals the due tasks declare,
// run each precondition, and either dispatch agent work as a `ready-for-agent`
// issue or (for `model: none`) run the worker inline.
//
// This module is the DECISION core, kept injectable so it tests with fakes: the
// GitHub I/O (the Actions run-ledger read for `lastSuccess`, the signal
// collectors, the issue search/create) is supplied by the thin CLI shell around
// `planRun`. The "should this run" verdict is always code here — never the
// shell's judgment (the same split the fleet planner uses).

import { dueSlots } from './slots.mjs';
import { planDispatch } from './dispatch.mjs';
import { isAgentless } from './model-map.mjs';

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
  for (const { task } of dueTaskSlots) for (const name of task.decl.signals) names.add(name);
  return [...names];
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
// verdict and, when it runs, either an inline marker (model: none) or a
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
      model: task.decl.model, outcome: task.decl.outcome,
      run: pre.run, reason: pre.reason, context: pre.context,
    };
    if (pre.error) rec.error = pre.error;
    if (pre.run) {
      if (isAgentless(task.decl.model)) {
        // model: none — the worker is code the scheduler runs inline; no issue.
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
