// The sheepdog pack's fleet-baseline WORKFLOW lives in the pack
// (packs/sheepdog/stubs/workflows/fleet-baseline.yml) and RUNS from the enforcer repo's
// own .github/ — GitHub reads workflows only from a repo's own .github/, never from the
// shared mount. So the enforcer hosts a MANAGED copy: the pack owns the content, the
// repo owns the file. (The logic the workflow runs is NOT vendored here; it stays in the
// mount at .claudinite/shared/packs/sheepdog/fleet-baseline/, which is why this record
// materializes exactly one file.)
//
// HOW IT LANDS, since a workflow file is the one thing the nightly cannot push itself:
// the mechanical apply writes it into the working tree as usual, preprocessing WITHHOLDS
// it from the commit (the Action's GITHUB_TOKEN may not write `.github/workflows/`, and
// the refusal would reject the whole ref), and baselining's AGENT stage lands it on the
// same maintenance branch over MCP — a credential that does hold the `workflows`
// permission. That is `withheldWorkflowPaths` in the baselining worker plus §2b of its
// task.md; this record declares WHAT to vendor and stays out of how (#649).
//
// This record was written, reverted, and rewritten in one day: the first version predated
// that mechanism and wedged missingbulb/Sheepdog's every converge on the rejected push.
// Nothing about the record was wrong — the delivery path underneath it did not exist yet.
//
// STANDING, NOT TRANSITIONAL — hence `retire: 'manual'`, the same shape (and the same
// reason) as `static-site-vendoring`. There is no old shape to move off: this workflow
// never existed anywhere else, so `legacyPresent` is false everywhere by construction and
// the retire pass would otherwise stage the record's deletion after one quiet cycle and
// silently end the sync. If a general "keep a pack's vendored set current" mechanism is
// ever built, this record is one of the two it replaces.
//
// THE GATE is the repo's own declaration of the sheepdog pack — not the presence of the
// workflow it materializes. That is deliberate and different from the two other
// vendoring records, which gate on a file adoption already put there: declaring the
// enforcer pack IS the adoption here, so the first cycle after the declaration installs
// the workflow, with no separate bootstrap step. Claudinite itself does not declare
// sheepdog, so the canon never self-applies.
const DECLARATION = '.claudinite-checks.json';
const PACK = 'sheepdog';
// The member's OWN vendored copy of the baselining worker, and the marker that says it
// can withhold. See the deadlock note on `appliesTo`.
const VENDORED_WORKER = '.claudinite/shared/packs/basics/tasks/baselining/worker.mjs';
const WITHHOLD_MARKER = 'withheldWorkflowPaths';

export default {
  id: 'sheepdog-fleet-baseline',
  landed: '2026-08-05',
  summary: 'sheepdog fleet-baseline workflow kept byte-current in the enforcer repo own .github/',

  // TWO conditions, and the second exists to break a DEADLOCK.
  //
  // The first is the gate proper: the repo declares the sheepdog pack. A `packs` entry is
  // either the bare id or `{ id, ... }` — both forms are legal in a declaration, so both
  // are matched. An unreadable or unparsable declaration means "not an enforcer as far as
  // this record can tell": skip, never guess a repo into hosting a fleet-wide lever.
  //
  // The second is about WHICH ENGINE THE MEMBER IS RUNNING. `migrations/apply.mjs` runs
  // from a fresh canon clone, so this record is always the newest one — but the worker
  // that pushes the result is the member's own VENDORED copy, which is only as new as its
  // last successful converge. A member still on a pre-withhold worker materializes this
  // file and then pushes it, the push is rejected whole, the converge fails, and the mount
  // never advances — so the withhold-capable worker can never arrive, because the only
  // thing that could deliver it is the converge this record is breaking. That is not
  // hypothetical: it is what happened to missingbulb/Sheepdog on 2026-08-05, twice.
  //
  // So the record asks the member whether it can cope yet, and stays inert until it can.
  // On the first cycle after the engine fix, this returns false, the converge pushes
  // cleanly, and the mount advances to a worker that withholds; on the next, it returns
  // true and the file is delivered through the agent stage as designed. Self-healing, in
  // two cycles, with no manual step on any member.
  //
  // The probe is a string match on the member's vendored worker rather than a version
  // read because there is no per-file version to read — the stamp covers the whole mount
  // and says nothing about which engine change is in it. It fails SAFE in every direction:
  // a missing or unreadable worker reads as "not capable", which only ever delays this
  // record, never wedges a repo.
  appliesTo: async (read) => {
    const text = await read(DECLARATION);
    if (!text) return false;
    let cfg;
    try { cfg = JSON.parse(text); } catch { return false; }
    const declares = (Array.isArray(cfg?.packs) ? cfg.packs : [])
      .some((e) => (typeof e === 'string' ? e : e?.id) === PACK);
    if (!declares) return false;
    const worker = await read(VENDORED_WORKER);
    return Boolean(worker && worker.includes(WITHHOLD_MARKER));
  },

  materialize: [
    { template: 'packs/sheepdog/stubs/workflows/fleet-baseline.yml', dest: '.github/workflows/fleet-baseline.yml' },
  ],

  // Nothing to leave behind: this record exists to keep one copy current, not to move a
  // repo off an older shape.
  legacyPresent: async () => false,
  retire: 'manual',
};
