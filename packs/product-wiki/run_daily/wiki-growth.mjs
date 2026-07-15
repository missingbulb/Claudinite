// product-wiki run_daily task: wiki-growth — one research-and-refine pass over
// the repo's product wikis, per the co-located worker doc. Weekly (the
// hash-staggered full-sweep day), not nightly and not projectChanged-gated:
// research arrives on the world's clock, not the repo's, and a nightly
// high-smarts pass economically pressures fabrication. The gate is pure
// signal-bundle code — no probes, cannot throw.

export default {
  id: 'wiki-growth',
  worker: 'packs/product-wiki/run_daily/wiki-growth.worker.md',
  order: null, // independent/concurrent
  full_sweep_supported: true,
  smarts: 'high', // open-web research + curation is the heaviest judgment

  async gate(repo, signals) {
    // The canon home repo carries no product wiki of its own.
    if (signals.isHome) return { run: false };
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly product-wiki growth pass' };
    }
    return { run: false };
  },
};
