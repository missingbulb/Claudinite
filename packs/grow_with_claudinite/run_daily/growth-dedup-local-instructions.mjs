// grow_with_claudinite run_daily task: growth-dedup-local-instructions (the growth
// lifecycle's pruning stage). Prunes local items the canon now covers, keeping items
// the canon states too generally. Worker: the co-located dedup.md. An ordinary
// independent unit — no barrier; it prunes against whatever canon the member
// currently mounts (merged main), so a just-opened promote PR never counts.
//
// Triggers: the canon changed (new canon may now cover local items) or the project's
// own docs changed. Full mode (weekly): re-check every local item against the canon
// regardless — so full_sweep_supported is true.

export default {
  id: 'growth-dedup-local-instructions',
  worker: 'packs/grow_with_claudinite/dedup.md',
  full_sweep_supported: true,
  smarts: 'high', // deciding a local item is truly redundant is a judgment call

  async gate(repo, signals) {
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly full dedup vs canon' };
    }
    if (signals.canonChanged) {
      return { run: true, targets: {}, reason: 'canon changed — local items may now be covered' };
    }
    // substantiveChange, not projectChanged: a housekeeping main move (bot bump /
    // baselining commit) changes no local lesson worth re-deduping (see signals.mjs).
    if (signals.substantiveChange) {
      return { run: true, targets: {}, reason: 'project docs changed substantively' };
    }
    return { run: false };
  },
};
