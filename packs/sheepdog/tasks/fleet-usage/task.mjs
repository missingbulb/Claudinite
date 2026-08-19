// sheepdog task: fleet-usage — the fleet-wide skill-usage aggregate, as a scheduled
// task. `agent_model: 'none'` with `code_work: 'node worker.mjs'`: the
// whole pass is deterministic code the executor runs as code-work — no agent
// phase. The worker calls its sibling, the sweep
// (aggregate-fleet-usage.mjs): read every member's own usage aggregate and rebuild
// this repo's `usage-fleet.GENERATED.json` as a pure function of them.
//
// WHY: every member folds its OWN skill-usage numbers, and can therefore answer "does
// this skill ever load HERE". The question the promotion ladder actually asks — does
// a skill earn its place at all — is fleet-shaped: never loading in one repo may just
// mean it isn't that repo's subject, while never loading in ANY of them means the
// trigger is mis-described or the content should never have been gated behind a skill.
// Only something looking at every member at once can tell those apart.
//
// CLASSIFICATION (per-project-scheduling DESIGN §6, the same note the census and the
// freshness sweep carry): an ORDINARY PACK TASK, not a fleet mechanism. Its
// *implementation* reads every member over a PAT, but its declaration, scheduling and
// lifecycle are exactly those of any pack task — it is active because this repo
// declares the sheepdog pack, and it runs however this repo's tasks run. Hence no
// `fleet` signal, and no session scope of its own (the PACK declares the executor
// reach — session-scope.mjs): those describe how a task is WIRED,
// and nothing about this task's wiring is fleet-shaped.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-usage',
  frequency: 'daily',                    // the members fold daily; this follows them
  precondition_signals: [],              // no signal — the sweep reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (task-code-work DESIGN §4)
  expected_outcome: 'merged-pr',         // the regenerated GENERATED aggregate rides a PR landed per the repo's delivery settings
  code_work: 'node worker.mjs',
  // One paged enumeration plus two REST reads per member (the coverage probe and the
  // usage file), all serial, then one PR. Same 900s the census and freshness sweep
  // carry, for the same reason: ~10x the expected walk while staying well inside the
  // hourly scheduler cadence, so a hung run is killed long before the next could
  // collide with it.
  code_work_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT; fleet-token.mjs states the grant

  // Fire daily unconditionally. Every input lives OUTSIDE this repo — each member's
  // own aggregate file — and no per-repo collector can see any of them, so there is
  // no signal that would tell us in advance whether anything changed. The sweep is
  // cheap to no-op: a fleet whose numbers did not move recomputes to the same file
  // and opens nothing.
  precondition() {
    return { run: true, reason: 'daily fleet usage aggregation (a stateless recompute; an unchanged fleet opens no PR)' };
  },
};
