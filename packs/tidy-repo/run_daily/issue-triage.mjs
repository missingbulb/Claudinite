// tidy-repo maintenance task: issue-triage. The one acting tidy task — per open issue
// it takes the first applicable action (close-if-implemented / needs-decision /
// blocked / quick-win / leave). "Implemented in main" must be verified against main's
// current content, never inferred; when inconclusive it comments, never closes. See
// packs/tidy-repo/RULES.md and the worker doc.
//
// Runs on the issues the bundle surfaced: those updated in the window, or all open
// issues when main moved / on the weekly full pass (a new commit can implement an
// old issue without the issue itself being touched).

export default {
  id: 'issue-triage',
  worker: 'packs/tidy-repo/run_daily/issue-triage.worker.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'medium', // deciding an issue's ask is true of main now is a verification call

  async gate(repo, signals) {
    if (!signals.issuesTouched.length) return { run: false };
    const reason = signals.fullSweep ? 'weekly full issue triage'
      : signals.mainMoved ? 'main moved — re-check implemented-in-main'
        : 'issue activity in window';
    return { run: true, targets: { issues: signals.issuesTouched }, reason };
  },
};
