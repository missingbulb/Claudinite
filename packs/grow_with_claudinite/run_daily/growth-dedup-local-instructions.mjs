// Fleet-core task: growth-dedup-local-instructions (growth phase 3). Prunes local
// items the canon now covers, keeping items the canon states too generally. Worker:
// growth/dedup.md.
//
// Triggers: the canon changed (new canon may now cover local items) or the project's
// own docs changed. Full mode (weekly): re-check every local item against the canon
// regardless — so full_sweep_supported is true.

export default {
  id: 'growth-dedup-local-instructions',
  worker: 'growth/dedup.md',
  order: 'growth:3',
  full_sweep_supported: true,
  smarts: 'high', // deciding a local item is truly redundant is a judgment call

  async gate(repo, signals) {
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly full dedup vs canon' };
    }
    if (signals.canonChanged) {
      return { run: true, targets: {}, reason: 'canon changed — local items may now be covered' };
    }
    if (signals.projectChanged) {
      return { run: true, targets: {}, reason: 'project docs changed' };
    }
    return { run: false };
  },
};
