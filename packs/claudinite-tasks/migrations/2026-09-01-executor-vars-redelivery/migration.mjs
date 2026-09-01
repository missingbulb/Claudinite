// Re-deliver the repository-variable bag to members the first record could no longer
// reach (#1545).
//
// WHY A SECOND RECORD EXISTS FOR ONE CHANGE. `2026-08-31-executor-vars-bag` is correct
// and still applies to anything below `claudinite-tasks` 60831.6. What it cannot reach
// is a member that stamped PAST 60831.6 without receiving it: `migrationApplies` is
// `want > have`, so above the number the record stops applying and stops vendoring,
// and the staged copy is swept by the next cycle as a leftover. Five members reached
// exactly that state when their apply-stage PRs were merged by hand before the stage
// delivered the withheld file. #1545 fixes the cause — a pack owing a withheld file is
// no longer stamped — but nothing retroactively lowers a stamp already written, so the
// only way back into range is a record at a version above where they landed.
//
// IT IS NOT A DUPLICATE DELIVERY. `appliesTo` tests the destination's own content, so
// on a member that already carries the line this is inert; the eight that received it
// normally see nothing. That guard is also what makes the pair safe on a member below
// 60831.6, where both records are in range — the first writes the line and the second
// then finds it present.
//
// Everything else is deliberately identical to the first record, which is why the
// anchor and the block are not restated here: see
// `packs/claudinite-tasks/migrations/2026-08-31-executor-vars-bag/migration.mjs` for
// why the rewrite anchors on the operator hold rather than the `# claudinite:secrets`
// marker, and why this is a rewrite rather than a materialize.
import original from '../2026-08-31-executor-vars-bag/migration.mjs';

export default {
  ...original,
  id: 'executor-vars-redelivery',
  landed: '2026-09-01',
  version: '60901.1',
  summary: 'the executor workflow carries CLAUDINITE_VARS on members that stamped past the first record without receiving it (#1545)',
};
