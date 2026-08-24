// Declare the `claudinite-tasks` pack into every existing member.
//
// The queue moved out of the engine into this pack (#1317, tasks-dispatch DESIGN
// §18), and the engine that ships beside this record holds only skew shims at the
// old paths — shims that import the pack. A member whose declaration does not name
// the pack would therefore converge to a mount whose scheduler workflow starts
// nothing, silently. Declaring it is what keeps every member's queue running
// through the move; a repo that truly wants no scheduled work removes the
// declaration afterwards, which is a durable opt-out (nothing re-adds it).
//
// SEED, NEVER OVERRIDE (the `declarePacks` op's contract): a member already
// declaring `claudinite-tasks` keeps its entry untouched. Idempotent thereafter.
//
// An ENGINE record, not a pack's, deliberately: it must land in the same engine
// flow that installs the shim-only engine tree, before the pack flow computes the
// vendor set from the declaration this record just wrote.
export default {
  id: 'claudinite-tasks-seed',
  landed: '2026-08-24',
  version: 1,
  summary: 'the claudinite-tasks pack — the queue, executor and task contract, moved out of the engine — is declared in every member so scheduled work keeps running through the move',
  declarePacks: [{ id: 'claudinite-tasks' }],
};
