// Fleet-core task: growth-extract-new-instructions (growth phase 1). Captures the
// last 24h of bugs/PRs/commits into the project's own docs. Worker: growth/extract.md.
//
// Trigger: the project changed in the window (commits / merged PRs). No distinct full
// mode — extract's window is a fixed lookback, and a quiet project has nothing to
// extract even on a full-sweep night — so full_sweep_supported is false (fullSweep is
// a no-op for it: the engine masks it, so the gate never sees fullSweep true here).

export default {
  id: 'growth-extract-new-instructions',
  worker: 'growth/extract.md',
  order: 'growth:1',
  full_sweep_supported: false,
  smarts: 'high', // generalizing/curating lessons is the heaviest judgment

  async gate(repo, signals) {
    if (signals.projectChanged) {
      return { run: true, targets: {}, reason: 'project changed in the window' };
    }
    return { run: false };
  },
};
