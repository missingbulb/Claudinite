// The operator's lever `fleet-baseline` is renamed `fleet-update`: the mechanism it
// forces on every member is the update, and "baseline" is retired vocabulary.
//
// WHAT A MEMBER CAN HOLD. The task id reaches a member-owned file in one place only:
// an enforcer that switched the lever off names `claudinite-fleet-sheepdog/fleet-baseline`
// in its `taskScheduler.disabledTasks`. This record rewrites that quoted id, as a
// literal, so the entry keeps meaning what its author meant. The lever is
// request-only, so an entry that stays stale disables nothing either way; the rewrite
// is what stops a declaration naming a task that is not on the shelf.
//
// NO READ-SIDE TOLERANCE. Nothing else carries the id across the rename: a work item
// is an issue, not a file, and an open item under the old id is already handled by the
// queue's generic lanes (a blocked one is reaped as naming an undeclared task, a picked
// one closes obsolete), and the lever's own history is its items, so a renamed
// task simply reads as never having run. The worker's `FLEET_BASELINE_*` environment
// names are unchanged, so a hand-run of the sweep reads the same knobs it did.
//
// NO `appliesTo` GATE. The literal exists only where an enforcer wrote it, and a
// rewrite over a file that lacks it is a no-op.
const OLD = '"claudinite-fleet-sheepdog/fleet-baseline"';
const NEW = '"claudinite-fleet-sheepdog/fleet-update"';

export default {
  id: 'fleet-update-rename',
  landed: '2026-09-25',
  // The version is cut on main after the merge, so a record cannot name it exactly:
  // this is the next number the bump would cut for the pack at 60922.6, above every
  // member's installed version, so the gap holds the record, and never above the number
  // cut, so an updated member does not re-apply it. RE-CHECK IT AGAINST `pack.mjs` ON
  // EVERY REBASE: main cuts versions while a branch waits, and a record that falls at or
  // below the installed version is silently already done.
  version: '60925.1',
  summary: 'the sheepdog lever fleet-baseline is renamed fleet-update; a member\'s taskScheduler.disabledTasks entry naming the old id is rewritten onto the new one',

  rewrite: [
    { file: '.claudinite-settings.json', replace: [{ from: OLD, to: NEW }] },
  ],

  legacyPresent: async (exists, read) => ((await read('.claudinite-settings.json')) ?? '').includes(OLD),
};
