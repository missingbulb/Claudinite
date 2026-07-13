// basics run_daily task: baselining — restore a member to the current canonical
// baseline (re-run the idempotent bootstrap to refresh mount + wiring, then evaluate
// the member against its declared packs' current checks). Migration application is a
// separate standalone pass (migrations/fleet-apply.mjs), not baselining's job.
// Riding basics — declared everywhere — makes it fleet-universal. Method: the
// co-located worker doc.
//
// Incremental trigger: the canon shipped new checks/wiring (canonChanged) → propagate.
// Full mode (weekly): re-baseline regardless, catching member-side drift the canon
// diff can't see — so full_sweep_supported is true.

export default {
  id: 'baselining',
  worker: 'packs/basics/run_daily/baselining.worker.md',
  order: null, // independent of the growth barrier
  full_sweep_supported: true,
  smarts: 'medium', // merges into CLAUDE.md/settings.json without clobbering — judgment

  async gate(repo, signals) {
    if (signals.fullSweep) {
      return { run: true, targets: { mode: 'full' }, reason: 'weekly full baselining (catch member-side drift)' };
    }
    if (signals.canonChanged) {
      return { run: true, targets: { mode: 'incremental' }, reason: 'canon shipped new checks/wiring' };
    }
    return { run: false };
  },
};
