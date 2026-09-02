// growth-discover-packs — the FLEET sweep for technologies the canon does not yet
// home. One weekly pass over every member: read what the fleet is actually built
// on, subtract what the canon's packs/ shelf already homes, and open a reviewed PR
// authoring the missing pack.
//
// The only pack-authoring stage there is. A member does not mint packs of its
// own — its local packs are what adoption seeded, and growth-extract writes
// rules into those — so a technology no canon pack homes is noticed and homed
// here or nowhere.
//
// Central because ONE run sees every member: first-sight dedup is trivial — the
// third member using a technology is recognised as the same gap as the first,
// with no cross-run state. That was the argument for keeping this central when
// everything else moved per-repo.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'growth-discover-packs',
  frequency: 'weekly',                   // the fleet's stacks are slow-moving — a weekly sweep, not a daily one
  // No repo-side gate: the opportunity is standing — a technology the fleet uses
  // that no canon pack homes — rather than a recent change here, so the weekly
  // anchor is the whole trigger and the run no-ops cheaply when nothing is
  // unhomed. The fleet roster it sweeps is read by the run itself.
  preconditions: ['none'],
  // This task reads every member's tree, which an ordinary session in this repo does
  // not reach. Reach is a property of WHICH endpoint the hand-off calls, so a task
  // needing more than an ordinary session names one; the key resolves in this repo's
  // own config, and until it is configured the hand-off converges the item to triage
  // naming what is missing.
  invocation_endpoint: 'fleet',
  agent_model: 'opus',                   // judging what is genuinely canon-worthy and authoring a pack is heavy judgment
  expected_outcome: 'pr',
  automerge: 'nothing',              // a new canon pack every repo will read — owner-approved, never auto-merged
  agent_instructions: 'task.md',
  agent_execution_timeout: 3600,         // manifest N members' stacks + author a pack — a generous weekly bound, extreme protection
};
