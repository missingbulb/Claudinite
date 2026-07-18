// tidy-repo maintenance task: repo-tidy — the whole nightly tidy-up in one unit.
// One worker assesses this repo's branches and PRs read-only, acts on its issues,
// then reconciles the standing tracker from the verdicts — the per-object method is
// the pack's skills (single-branch-status / single-pr-status / single-issue-triage);
// this task just carries the targets and sequences the pass. See RULES.md + the worker.
//
// Runs when the window surfaced genuine tidy work — a PR or issue actually updated in
// the window — or on a substantive default-branch move (which widens the candidate set
// to ALL open branches/PRs/issues, since a real commit can implement an old issue or
// land an open PR without the object itself being touched), or on the weekly full
// sweep. A housekeeping-only main move (a nightly baseline commit, a bot version bump)
// no longer widens: it lands nothing and implements nothing, so a quiet-but-maintained
// repo isn't re-tidied every night (see routines/fleet/signals.mjs `widen`). Because one
// worker does dimensions-then-reconcile in sequence, there is no ordering barrier: the
// unit is independent/concurrent like every other.

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
      : signals.substantiveChange ? 'project changed substantively — re-check landed status'
        : 'repo activity in window';
    return { run: true, targets: { branches, prs: signals.prsTouched, issues: signals.issuesTouched }, reason };
  },
};
