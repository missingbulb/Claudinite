// Keep the probe workflow byte-current — and, in doing so, run the one code path #649
// left unexercised.
//
// WHAT THIS RECORD IS FOR. `applyMaterializations` (engine/migrations/registry.mjs) has
// a branch for a `dest` under `.github/workflows/`: the caller must announce, through
// `CLAUDINITE_CAN_WITHHOLD_WORKFLOWS`, that it can DELIVER such a file, or the write is
// reported as skipped rather than made. The pack update flow sets that variable and
// routes the write to `.claudinite/pending-workflows/`. Every part of that had shipped;
// no record had ever driven it. The scheduler workflow's own convergence reaches the
// same `write` from the other side (`pendingSchedulerWorkflow`), which is why the lane
// was believed to work — but "believed" is what #768 recorded as still open, and this is
// the record that answers it against a live member instead.
//
// STANDING, NOT TRANSITIONAL. There is no old shape to leave behind (`legacyPresent` is
// false by construction). Its job is to keep the vendored copy equal to the pack's
// template, forever — the same shape as static-website's `static-site-vendoring`, and
// the same reason: the pack owns the content, the repo owns the file, and "edit the
// pack, not the copy" is only true if something re-vendors.
//
// VERSION 2, WHICH IS THE WHOLE POINT. An install stamps the newest version and runs no
// records, so a record shipped at the version a repo adopts at can never reach it —
// `migrationApplies` is `want > have`. The probe is adopted at pack version 1 (which
// seeds the file via `seedOps` and nothing else); this record lands at 2, so a member
// sitting at 1 has a real gap for the update flow to close. It also means the record
// UPDATES a workflow that is already present rather than creating one, which is the
// shape any fleet-wide workflow fix would take.
//
// THE GATE IS THE WORKFLOW'S OWN `name:`, so this record touches only a repo that
// actually carries the probe — and never the canon, which holds the template under
// `packs/` and no copy in its own `.github/workflows/`.
const PROBE = '.github/workflows/claudinite-workflow-probe.yml';

export default {
  id: 'workflow-probe-current',
  landed: '2026-08-14',
  version: 2,
  summary: 'keep the canary-probe workflow byte-current — the first record to materialize into .github/workflows/ (#649)',

  appliesTo: async (read) => {
    const text = await read(PROBE);
    if (!text) return false;
    return /^name:\s*['"]?Claudinite workflow probe['"]?\s*$/m.test(text);
  },

  materialize: [
    { template: 'packs/canary-probe/stubs/workflows/claudinite-workflow-probe.yml', dest: PROBE },
  ],

  // Nothing to leave behind: this record exists to keep a copy current, not to move a
  // repo off an older shape.
  legacyPresent: async () => false,
};
