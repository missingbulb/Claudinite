// Fleet-core task: growth-pack-gap-scan. Answers a leading question about the repo —
// which technologies it uses that no Claudinite pack (stub included) covers — and
// converges a "Pack gaps" tracking issue. Worker: growth/pack-gap-scan.md.
//
// Independent of the growth phased barrier (it edits no docs and no canon — it only
// files an issue), so order is null: it runs concurrently with the other unordered
// units. Trigger: the weekly full sweep only — a repo's technology composition is
// slow-moving, so a weekly re-scan is the right cadence and adds no daily cost. Hence
// full_sweep_supported is true and the gate fires solely on fullSweep.

export default {
  id: 'growth-pack-gap-scan',
  worker: 'growth/pack-gap-scan.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'medium', // naming technologies + checking the shelf is bounded judgment, lighter than lesson curation

  async gate(repo, signals) {
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly pack-gap re-scan' };
    }
    return { run: false };
  },
};
