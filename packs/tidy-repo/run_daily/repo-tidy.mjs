// tidy-repo maintenance task: repo-tidy — the whole nightly tidy-up in one unit.
// One worker assesses this repo's branches and PRs read-only, acts on its issues,
// then reconciles the standing tracker from the verdicts — the per-object method is
// the pack's skills (single-branch-status / single-pr-status / single-issue-triage);
// this task just carries the targets and sequences the pass. See RULES.md + the worker.
//
// Runs when the window surfaced any tidy work — a non-default branch touched, a PR or
// issue touched — or on the weekly full sweep (which re-examines all of them; a main
// move can implement an old issue or land an open PR without the object being touched).
// Because one worker does dimensions-then-reconcile in sequence, there is no ordering
// barrier: the unit is independent/concurrent like every other.

export default {
  id: 'repo-tidy',
  worker: 'packs/tidy-repo/run_daily/repo-tidy.worker.md',
  full_sweep_supported: true,
  smarts: 'medium', // the landed-status and implemented-in-main calls are judgment

  async gate(repo, signals) {
    const branches = signals.branchesTouched.filter((b) => b !== repo.defaultBranch);
    const active = signals.fullSweep || branches.length || signals.prsTouched.length || signals.issuesTouched.length;
    if (!active) return { run: false };
    const reason = signals.fullSweep ? 'weekly full repo tidy'
      : signals.mainMoved ? 'main moved — re-check landed status'
        : 'repo activity in window';
    return { run: true, targets: { branches, prs: signals.prsTouched, issues: signals.issuesTouched }, reason };
  },
};
