// sheepdog task: fleet-pack-seeds — does every member declare the packs this fleet
// standardizes on? `agent_model: 'none'` with `code_work: 'node worker.mjs'`: the whole
// pass is deterministic code the executor runs as code-work — no agent, no dispatch
// issue. The worker calls its sibling, the sweep (check-fleet-pack-seeds.mjs): read
// every covered member's declaration and add the seeds it lacks.
//
// WHY: some packs need a parameter no member can derive, because the answer is a fact
// about the FLEET rather than about that repo. Canon cannot supply it — a bootstrap run
// does not know which fleet it is bootstrapping into — and one fleet's value hardcoded
// in shared code is exactly the coupling packs exist to prevent. The enforcer can: it
// IS the fleet. So this repo's `packSeeds` config lists what its members should
// declare, and the sweep converges that list across them.
//
// IT NAMES NO PACK. Every id comes from this repo's own config; the task and its sweep
// carry the mechanism only. A fleet standardizing on different packs changes its
// config, not this pack.
//
// THE ONE SWEEP IN THIS PACK THAT WRITES. The others report a condition and converge an
// issue for a human; a seed carries no human decision (the fleet already made it, in
// this repo's config), so an issue asking someone to copy it into every member would be
// ceremony around a mechanical edit. Hence `expected_outcome: 'none'`: the write goes to
// OTHER repos, not this one, and the outcome ceiling describes what a task may do to its
// OWN repo — this task opens no PR here at all.
//
// CLASSIFICATION (per-project-scheduling DESIGN §6, the same note the other sweeps
// carry): an ORDINARY PACK TASK, not a fleet mechanism. Its *implementation* reaches
// every repo under the owner over a PAT, but its declaration, scheduling and lifecycle
// are exactly those of any pack task — it is active because this repo declares the
// sheepdog pack, and it runs however this repo's tasks run. Hence no
// `session_scope: 'fleet'` and no `fleet` signal: those describe how a task is WIRED,
// and nothing about this task's wiring is fleet-shaped.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-pack-seeds',
  frequency: 'daily',                    // a member becomes writable the moment its nightly converge vendors the pack — daily is what turns that into "the next morning"
  precondition_signals: [],              // no signal — the sweep reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (task-code-work DESIGN §4)
  expected_outcome: 'none',              // it writes to MEMBERS, never to this repo: no PR here, ever
  code_work: 'node worker.mjs',
  // Two or three REST reads per member (declaration, whether each seeded pack is on its
  // disk, and one PUT for the members being written) plus the enumeration, all serial,
  // with a secondary rate limit making it slower still. The same 900s the other sweeps
  // carry, for the same reason: ~10x the expected walk while staying inside the hourly
  // cadence.
  code_work_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT; fleet-token.mjs states the grant

  // Fire daily unconditionally. Every input lives OUTSIDE this repo — another member's
  // declaration, another member's mount — and no per-repo collector can see either, so
  // there is no signal that would say in advance whether the answer changed. The sweep
  // is cheap to no-op: a fleet whose members already declare its seeds reads each one
  // and writes nothing, and a fleet that seeds nothing stops before the walk.
  precondition() {
    return { run: true, reason: 'daily fleet pack-seed sweep (declares this fleet\'s seeded packs in members that lack them; no-ops on a fleet already converged)' };
  },
};
