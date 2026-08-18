// sheepdog task: fleet-roster — one walk of the fleet answering the enforcer's two
// standing questions about every repo under the owner (#788):
//
//   is this repo a MEMBER?                        → `fleet-adoption` issues
//   is that membership still MEANING anything?    → `fleet-drift` issues
//
// `agent_model: 'none'` with `prework: 'node worker.mjs'`: the whole pass is
// deterministic code the executor runs as prework — no agent phase.
// The worker calls its sibling, the sweep (check-fleet-roster.mjs), which enumerates
// the fleet once, reads each repo's declaration once, and hands the resulting roster to
// the two issue families (adoption-issues.mjs, drift-issues.mjs).
//
// WHY ONE TASK. These were two — a daily `fleet-census` and a weekly `fleet-freshness`
// — and each carried its own enumeration, its own structural skips and its own
// declaration read per repo. The freshness half's own header said it "takes coverage as
// given" while in fact re-deriving it on another cadence in another process, so the two
// classifications could disagree and did. One walk means one membership verdict per
// repo, one report, and one failure boundary.
//
// WHY DAILY, and what it costs. The freshness question was weekly because drift is
// measured in DAYS and a daily re-ask could not change its answer. Merged, that
// argument buys nothing: the walk runs daily for the coverage question regardless, and
// the alternative — half the task gated on a weekly cadence it computed itself — would
// reimplement dueness, which the engine owns (the tick instantiates a task's item
// when its anchor comes) and which is not a thing a task can ask about from inside
// itself. So the freshness probe now runs daily too: roughly two extra REST
// reads per covered member on the six days that used to be coverage-only. The merge is
// not an API-call saving and is not claimed as one — what it buys is one roster instead
// of two that can disagree. Drift converging within a day rather than a week is the
// side benefit, and convergeDrift's silence on an unchanged verdict is what keeps the
// faster cadence from turning every thread into a wall of identical notes.
//
// CLASSIFICATION (per-project-scheduling DESIGN §6, the same note RULES.md carries):
// this is an ORDINARY PACK TASK, not a fleet mechanism. Its *implementation* happens to
// scan every repo under the owner over a PAT, but its declaration, scheduling and
// lifecycle are exactly those of any pack task — it is active because this repo declares
// the sheepdog pack, and it runs however this repo's tasks run. Hence no `fleet` signal
// and no session scope of its own (the PACK declares the executor reach): those describe
// how a task is WIRED, and nothing about this task's wiring is fleet-shaped. The
// cross-repo reach lives in the implementation, never in the declaration.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-roster',
  frequency: 'daily',                    // the coverage question's cadence — a repo created, adopted or archived under the owner should not wait a week
  precondition_signals: [],              // no signal — the sweep reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (task-prework DESIGN §4)
  expected_outcome: 'none',              // the honest ceiling: it opens ADOPTION and DRIFT issues, never a PR — it reports, it does not repair
  prework: 'node worker.mjs',
  // The walk covers EVERY repo in the fleet: one paged enumeration, one declaration
  // read per repo, two further reads per measured member (scheduler workflow, canon
  // compare), then both issue convergences — all serial, and a secondary rate limit
  // makes it slower still. The same 900s both predecessors carried: ~10x the expected
  // walk while staying well inside the hourly scheduler cadence, so a hung sweep is
  // killed long before the next run could collide with it.
  prework_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT the sweep reads the fleet with

  // Fire daily unconditionally. Every input lives OUTSIDE this repo — another repo's
  // declaration, another member's workflow, canon's head — and no per-repo collector
  // can see any of them, so there is no signal that would tell us in advance whether
  // either answer changed. Cheap to no-op: a converged fleet opens and closes nothing,
  // and an unhealthy member that is unhealthy for the same reason is not even
  // commented on.
  precondition() {
    return { run: true, reason: 'daily fleet roster sweep — coverage and freshness in one walk (converges adoption and drift issues; no-ops cheaply on a converged fleet)' };
  },
};
