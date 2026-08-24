// claudinite-dashboard task: fleet-digest — the owner's morning brief about the FLEET,
// as a scheduled task. What did I accomplish yesterday, and what have I let go quiet?
//
// It replaces a hand-run daily routine, and the shape of that routine is the whole
// design: a deterministic pass ranks yesterday's merged PRs and closed issues BY SIZE
// and keeps a shortlist half again longer than the brief needs, then an agent reads
// only those and picks the ones that were actually accomplishments. Size is
// arithmetic and belongs in code; "biggest thing I did yesterday" is a reading of the
// text and belongs to a model. Handing the agent exactly `pick` items would leave it
// nothing to judge — the ranking would have chosen for it — so it gets ~1.5x.
//
// TWO STAGES, CONDITIONALLY. `code_work` (worker.mjs) collects, ranks, and pushes the
// shortlist to a data branch, then requests the agent (task-code-work DESIGN §3, E4).
// On a day the fleet merged nothing it writes the brief itself and requests NO agent —
// a quiet day still gets a dated file, because a missing brief must mean a FAULT and
// not a slow Tuesday, but it does not need a model to say "nothing happened".
//
// WHY IT LIVES IN THE DASHBOARD PACK. It writes the dated series this pack's fleet
// page reads: the producer and the only thing that surfaces it are one adoption. It
// was the `claudinite-fleet-sheepdog` pack's sixth sweep until it moved here, and what it brought with
// it is the cross-repo enumeration — a trimmed copy in `fleet-reads.mjs` rather than
// an import, because two independently-adopted packs must not depend on each other.
//
// WHAT ADOPTING THIS PACK NOW COSTS. A repo that declares `claudinite-dashboard` for
// the page alone gets this task too, and it needs `FLEET_GITHUB_TOKEN` to run: without
// that secret the executor parks the item asking for it. There is no config gate — the
// pack's own README says so plainly, so the cost is stated where someone adopting
// reads it rather than discovered from a parked item.
//
// CLASSIFICATION: an ORDINARY PACK TASK. Its *implementation* reads every repo under
// the owner over a PAT, but its declaration, scheduling and lifecycle are those of any
// pack task — it is active because the repo declares this pack. Hence no `fleet`
// signal and no session scope of its own.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-digest',
  frequency: 'daily',
  // Nothing here DEPENDS on the fleet sweeps, but a brief written while the census is still
  // running would report a fleet in mid-sweep, and the owner reads one story about the fleet each
  // morning, in order. That used to be an hour's anchor offset, which expressed the wish and
  // enforced nothing — a sweep running long simply overran it. `schedule_after:` is the mechanism
  // (tasks-dispatch DESIGN §9, §17.1): this yields while any of them is live THIS cycle and goes
  // the moment the last one settles, however long they took.
  //
  // Naming another pack's tasks is safe whether or not this repo declares it: the yield matches a
  // live ITEM, and a task nobody declares has none, so an absent sheepdog is simply no constraint.
  schedule_after: [
    'claudinite-fleet-sheepdog/fleet-roster',
    'claudinite-fleet-sheepdog/fleet-pack-seeds',
  ],
  // None. Every input lives OUTSIDE this repo — other members' pull requests and
  // issues — and no per-repo collector can see any of them, so there is no signal that
  // would tell us in advance whether yesterday had anything in it. The cheap no-op is
  // the same shape as any always-fire fleet sweep: an empty day writes one small file.
  precondition_signals: [],
  // Reading six PR bodies and judging which four were the day's real work is
  // ordinary summarization against a bounded, pre-fetched input. Sonnet is the right
  // tier for it; opus would be paying for judgment this task has already narrowed.
  agent_model: 'sonnet',
  // The brief lands as a dated file, delivered per this repo's delivery settings.
  expected_outcome: 'merged-pr',
  agent_instructions: 'task.md',
  // Read six items and write ~120 words. The bound is extreme protection, not a
  // scheduling knob — a brief that takes ten minutes has gone wrong.
  agent_execution_timeout: 900,

  code_work: 'node worker.mjs',
  // One paged repo enumeration, then per member one declaration read, one closed-PR
  // walk and one closed-issue read, then one detail read per merged PR (bounded at 80
  // by the collector). Serial, so sized like the other fleet sweeps: ~10x the expected
  // walk, well inside the hourly scheduler cadence.
  code_work_timeout: 900,
  // The account-spanning PAT the fleet reads run under — this repo's only secret, and
  // the reason this task cannot run in a repo that has not configured one.
  // fleet-token.mjs, beside this file, states the grant.
  required_secrets: ['FLEET_GITHUB_TOKEN'],

  // Fire daily, unconditionally. There is deliberately no "only if something
  // happened" gate: whether anything happened is precisely what the run finds out,
  // and it can only find out by looking at the other repos. The code-work decides
  // for itself whether the day needs an agent.
  precondition() {
    return {
      run: true,
      reason: "daily fleet operations brief for the previous UTC day (a quiet day is written by code_work, with no agent)",
      context: [
        'Code-work has already collected and ranked yesterday\'s merged pull requests and closed issues across the fleet, and pushed the shortlist to the data branch named below.',
        'Your job is only the judgment: read those candidates and pick the strongest ones, then write the dated brief. Do not re-enumerate the fleet, do not widen past the shortlist, and change no code anywhere.',
      ],
    };
  },
};
