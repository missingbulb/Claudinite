// Fleet-core task: growth-stack-manifest (stage 1 of pack discovery). An agent answers a
// leading question about the repo — its technologies, the APIs/services it integrates, and
// its deployment/distribution targets — and converges a "Stack manifest" tracking issue.
// It decides NOTHING about packs; that is stage 2's separate, central job. Worker:
// growth/stack-manifest.md.
//
// Independent of the growth phased barrier (it edits no docs and no canon — it only files
// an issue), so order is null: it runs concurrently with the other unordered units.
// Trigger: the weekly full sweep only — a repo's stack is slow-moving, so a weekly re-scan
// is the right cadence and adds no daily cost. Hence full_sweep_supported is true and the
// gate fires solely on fullSweep.

export default {
  id: 'growth-stack-manifest',
  worker: 'growth/stack-manifest.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'medium', // a comprehensive, evidence-grounded manifest is bounded but wants care

  async gate(repo, signals) {
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly stack-manifest re-scan' };
    }
    return { run: false };
  },
};
