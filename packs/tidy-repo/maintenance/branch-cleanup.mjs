// tidy-repo maintenance task: branch-cleanup. Assess-only — reports which branches
// carry genuine unmerged work and which are safe to delete (the landed-status test),
// never deletes or pushes. See packs/tidy-repo/RULES.md and the worker doc.
//
// Runs when there are non-default branches to assess and there was relevant activity
// (branchesTouched is populated only on a push, a main move, or the weekly full pass —
// and a main move is what flips a branch to "superseded"). Full mode re-examines all.

export default {
  id: 'branch-cleanup',
  worker: 'packs/tidy-repo/maintenance/branch-cleanup.worker.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'medium', // the landed-status test (superseded/orphaned) is a judgment call

  async gate(repo, signals) {
    const branches = signals.branchesTouched.filter((b) => b !== repo.defaultBranch);
    if (!branches.length) return { run: false };
    const reason = signals.fullSweep ? 'weekly full branch review'
      : signals.mainMoved ? 'main moved — re-check landed status'
        : 'branch activity in window';
    return { run: true, targets: { branches }, reason };
  },
};
