// tidy-repo maintenance task: tidy-report — the per-repo reconciliation unit. After
// this repo's branch-cleanup / pr-assess / issue-triage units settle, it rewrites the
// standing tidy tracker to today's snapshot from their verdicts. Because the single-
// object workers only see their own object, this is where the repo-level picture is
// owned. order: 'tidy:report' — the orchestrator runs it after the repo's other tidy
// units (a per-repo mini-barrier, narrower than the fleet-wide growth barrier).

export default {
  id: 'tidy-report',
  worker: 'packs/tidy-repo/maintenance/tidy-report.worker.md',
  order: 'tidy:report',
  full_sweep_supported: true,
  smarts: 'low', // aggregate the run's verdicts and rewrite the tracker — mechanical

  async gate(repo, signals) {
    const branches = signals.branchesTouched.filter((b) => b !== repo.defaultBranch);
    const active = signals.fullSweep || branches.length || signals.prsTouched.length || signals.issuesTouched.length;
    if (!active) return { run: false };
    return { run: true, targets: {}, reason: signals.fullSweep ? 'weekly tracker refresh' : "reconcile this run's tidy verdicts" };
  },
};
