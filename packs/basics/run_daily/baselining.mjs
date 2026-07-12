// Fleet-core task: baselining — the per-member half of the fleet bootstrap sweep
// (re-run the idempotent bootstrap to refresh mount + wiring, then evaluate the
// member against its declared packs' current checks). See routines/fleet/DESIGN.md
// and routines/auto-fleet-bootstrap.md Step 2.
//
// Incremental trigger: the canon shipped new checks/wiring (canonChanged) → propagate.
// Full mode (weekly): re-baseline regardless, catching member-side drift the canon
// diff can't see — so full_sweep_supported is true.

export default {
  id: 'baselining',
  worker: 'routines/auto-fleet-bootstrap.md',
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
