// Move a member's `dormant` declaration onto the pack that owns the mechanism it stops.
//
// WHAT CHANGED. `dormant` was a top-level key of `.claudinite-settings.json`, validated
// by the engine and normalized onto the loaded config. It never belonged there: every
// effect it has is an effect on the work-item queue — nothing is instantiated, nothing
// is picked up, and nothing outside expects movement — and a repo that declares no
// `claudinite-tasks` has no scheduler for the word to mean anything about. So the
// setting is now one of this pack's parameters and this pack's predicate answers for it
// (dormancy.mjs), which is also what let the fleet sweeps stop treating a stopped
// scheduler as a sick repository (#1845).
//
// WHY A RECORD RATHER THAN A TOLERANCE ALONE. The reader resolves both spellings, so a
// member that never runs this record still reads correctly — the tolerance is what makes
// the two halves safe to land in either order. What the record buys is the END of that
// tolerance: it is gated on a convergence window rather than on a census, because the
// canon cannot see which repos are active, inert or long stale, so "no member still
// declares it at the top level" is a condition nothing can ever answer. Without the
// record, the window never starts and the tolerance stands forever (#1846).
//
// WHO IT APPLIES TO — every member carrying a declaration, which is the only artifact
// this op reads or writes. It is deliberately NOT gated on the scheduler workflow the
// way the pack's seed record is: a repo that stopped its scheduler is exactly the repo
// most likely to have deleted that workflow, and gating on it would strand the members
// whose declaration most needs rewriting. The op itself is the narrower gate — it moves
// the key only where `claudinite-tasks` is declared, and drops it where the pack is not
// there to be governed.
//
// NO APPLY STAGE. The rewrite is deterministic and needs no session: the key's new home
// is fixed, and the op preserves every other thing the member wrote.
export default {
  id: 'dormant-is-a-scheduler-setting',
  landed: '2026-09-07',
  version: 1,
  summary: 'the `dormant` declaration moves from the top level of .claudinite-settings.json onto the claudinite-tasks pack entry, where the scheduler it stops is declared',
  movePackOwnedSettings: [{ key: 'dormant', pack: 'claudinite-tasks' }],
};
