// The task execution surface as a pack (tasks-dispatch DESIGN §18): the queue, the
// executor, signals, the task contract, calendar/anchor math, dispatch, run
// records, code-work, the delivery lane and the two workflow stubs. The engine
// stays pack distribution only; declaring this pack is what puts scheduled work —
// and with it the daily update task's ability to run — on a repo.
//
// `shared-code/` is this pack's published import surface: the one place another
// pack's code may import from a pack it requires (DESIGN §18). Everything else in
// this tree is internal.
export default {
  version: '60824.1',
  minEngineVersion: '60823.1',
  ruleRoutingGuidance: {
    belongs: 'the work-item queue, the executor, task declarations and contract, scheduling anchors, dispatch, run records, and the delivery lane',
    excludes: 'what any one task does with its subject — that is the owning pack; the update flows themselves are claudinite-lifecycle',
  },
  seededByDefault: true,
  // Scheduled tasks and checks live in this pack's own tasks/ and worldRules/,
  // discovered structurally like every pack's.
};
