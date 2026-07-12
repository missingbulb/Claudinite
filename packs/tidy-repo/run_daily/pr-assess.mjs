// tidy-repo maintenance task: pr-assess. Assess-only — reports which open PRs should
// stay open and which are closeable (merged/superseded/stale), never closes a PR.
// See packs/tidy-repo/RULES.md and the worker doc.
//
// Runs on the PRs the signal bundle surfaced: those updated in the window, or all open
// PRs when main moved / on the weekly full pass (a merge can make an open PR landed).

export default {
  id: 'pr-assess',
  worker: 'packs/tidy-repo/run_daily/pr-assess.worker.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'medium', // judging superseded-by-other-path is a content call, not a status flag

  async gate(repo, signals) {
    if (!signals.prsTouched.length) return { run: false };
    const reason = signals.fullSweep ? 'weekly full PR review'
      : signals.mainMoved ? 'main moved — re-check PR landed status'
        : 'PR activity in window';
    return { run: true, targets: { prs: signals.prsTouched }, reason };
  },
};
