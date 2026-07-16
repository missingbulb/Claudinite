// The gate evaluator — the "should I run" half of the engine. Given a member repo,
// its signal bundle, and its applicable tasks, it runs each task's gate (pure code)
// and turns every run:true verdict into a plan unit. This is where the whole worklist
// is decided in code, before any worker agent is dispatched (see routines/fleet/DESIGN.md).

// fullSweep is masked per task: a task sees fullSweep true only if it declares
// full_sweep_supported. For every other task fullSweep is a no-op — the engine
// guarantees the gate never sees it — so a weekly sweep never *attempts* a full
// action a task doesn't have.
function taskSignals(signals, task) {
  return { ...signals, fullSweep: signals.fullSweep === true && task.full_sweep_supported === true };
}

// Evaluate one member's tasks. A gate that throws is isolated: it drops that one
// task (recorded in `errors`) without sinking the repo's other units.
export async function planRepo(repo, signals, tasks, gh) {
  const units = [];
  const errors = [];
  for (const task of tasks) {
    let verdict;
    try {
      verdict = await task.gate(repo, taskSignals(signals, task), gh);
    } catch (e) {
      errors.push({ repo: repo.fullName, task: task.id, error: e.message });
      continue;
    }
    if (verdict && verdict.run) {
      units.push({
        repo: repo.fullName,
        task: task.id,
        worker: task.worker,
        // A canon task's worker doc is read from the canon checkout (workerRepo
        // null); a local task carries its member repo here, so the orchestrator
        // reads its worker from the member (its worker path is member-relative).
        workerRepo: task.workerRepo ?? null,
        targets: verdict.targets ?? {},
        reason: verdict.reason ?? '',
        smarts: task.smarts ?? 'medium',
      });
    }
  }
  return { units, errors };
}
