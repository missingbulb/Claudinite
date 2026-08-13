// Pack independence (extending.md; the canon-side `pack-independence` barrier):
// packs no longer import each other's code — a fixed folder-barrier is now
// CONTRIBUTED as manifest data (`requires` the mechanism pack +
// `contributes` on pack.mjs; the engine builds the rule) and the shared
// path/migration helpers moved into the vendored engine lib (engine/checks/helpers/).
// The old code-composition export (`defineBarrier`) is gone.
//
// Canon-side the conversion is complete (rule first, then the fixes — one
// commit each). Member-side there are no mechanical ops: nothing in a
// consumer's tree is renamed or rewritten. The AGENTIC note for the nightly
// worker: if a member's own local packs (.claudinite/local_packs/) composed a
// barrier by importing the shared engine, convert each to the contribution
// shape — move the barrier object (id, edges, description, why, doc,
// crossingExcuse, gateDir) onto the local pack's manifest under
// `contributes` and add the mechanism pack to its `requires`. A local pack
// still importing the removed export fails loudly at pack discovery (the
// runner's fail-soft config finding names the broken manifest) — that
// diagnostic is the member-side signal. Consumers with no such local packs
// need nothing.
//
// The durable enforcement is the check, which every member runs from its own
// snapshot; this record only carries the one-time conversion guidance through
// the fleet's next cycles.
export default {
  id: 'pack-independence',
  landed: '2026-07-19',
  version: 1,
  summary: 'packs compose by declaration + contributed config, never code imports; local packs that imported the shared barrier engine convert to `contributes` on their manifest',
  // The AGENTIC note above, now machine-readable (task-prework DESIGN §7):
  // baselining's deterministic preprocessing detects this and escalates to the
  // agent stage instead of advancing the stamp past it. There are no mechanical
  // member-side ops, so this is the record's whole member-side work.
  // The agentic note this record carried RETIRED, drained (#768 Phase 4). It asked a
  // member whose local pack composed a barrier by importing the shared engine to move
  // that barrier onto its manifest under `contributes`. Every readable member's stamp
  // now sits weeks past this record's landed date — measured 2026-08-12: ten of the
  // twelve fleet members read 2026-08-05 or later, the remaining two are private and
  // unreadable anonymously, and even the fleet's most stale member is 17 days past
  // 2026-07-19 — so every repo that could apply it has.
  //
  // Retiring it is what lets the ENGINE flow serve a repo whose gap contains this
  // record: that flow admits no agentic stage by construction (DESIGN §5), so a record
  // still carrying a note is a stop, not a step.
};
