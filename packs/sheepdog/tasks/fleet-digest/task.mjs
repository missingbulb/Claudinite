// sheepdog task: fleet-digest — the owner's morning brief about the FLEET,
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
// TWO STAGES, CONDITIONALLY. `prework` (worker.mjs) collects, ranks, and pushes the
// shortlist to a data branch, then requests the agent (task-prework DESIGN §3, E4).
// On a day the fleet merged nothing it writes the brief itself and requests NO agent —
// a quiet day still gets a dated file, because a missing brief must mean a FAULT and
// not a slow Tuesday, but it does not need a model to say "nothing happened".
//
// CLASSIFICATION, the same note every other sheepdog task carries: an ORDINARY PACK
// TASK, not a fleet mechanism. Its *implementation* reads every member over a PAT, but
// its declaration, scheduling and lifecycle are those of any pack task — it is active
// because the repo declares the sheepdog pack. Hence no `fleet` signal and no session
// scope of its own.
//
// It was a local pack in the enforcer repo until #954, on the reasoning that a brief is
// addressed to THIS fleet's owner about what THIS owner counts as an accomplishment.
// What made it portable is that neither claim survived contact with the code: the task
// ends at a written file, so it holds no address, no recipient and no transport, and
// what it counts as an accomplishment is `pick` and `nudge` — two config knobs, both
// defaulted. What is left is the fleet-shaped half — enumerate the members, rank a day
// by size, filter the machine's own artifacts out — which is the sheepdog pack's whole
// subject.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-digest',
  // The 05:00 slot, an hour after the fleet sweeps at 04:00. Nothing here depends on
  // them, but a brief written while the census is still running would report a fleet
  // in mid-sweep, and the owner reads one story about the fleet each morning, in order.
  frequency: 'daily+1h',
  // None. Every input lives OUTSIDE this repo — other members' pull requests and
  // issues — and no per-repo collector can see any of them, so there is no signal that
  // would tell us in advance whether yesterday had anything in it. The same reasoning
  // fleet-usage carries, and the same cheap no-op: an empty day writes one small file.
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

  prework: 'node worker.mjs',
  // One paged repo enumeration, then per member one declaration read, one closed-PR
  // walk and one closed-issue read, then one detail read per merged PR (bounded at 80
  // by the collector). Serial, so sized like the other fleet sweeps: ~10x the expected
  // walk, well inside the hourly scheduler cadence.
  prework_timeout: 900,
  // The account-spanning PAT every sheepdog sweep reads the fleet with. The digest
  // needs Pull requests READ on top of what the census already asks for.
  required_secrets: ['FLEET_GITHUB_TOKEN'],

  // Fire daily, unconditionally. There is deliberately no "only if something
  // happened" gate: whether anything happened is precisely what the run finds out,
  // and it can only find out by looking at the other repos. The prework decides
  // for itself whether the day needs an agent.
  precondition() {
    return {
      run: true,
      reason: "daily fleet operations brief for the previous UTC day (a quiet day is written by prework, with no agent)",
      context: [
        'Prework has already collected and ranked yesterday\'s merged pull requests and closed issues across the fleet, and pushed the shortlist to the data branch named below.',
        'Your job is only the judgment: read those candidates and pick the strongest ones, then write the dated brief. Do not re-enumerate the fleet, do not widen past the shortlist, and change no code anywhere.',
      ],
    };
  },
};
