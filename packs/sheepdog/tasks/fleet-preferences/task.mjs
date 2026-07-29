// sheepdog task: fleet-preferences — does every member know where this fleet's users
// keep their personal preferences? `agent_model: 'none'` with `agent_preprocessing:
// 'node worker.mjs'`: the whole pass is deterministic code the scheduler runs as a
// subprocess — no agent, no dispatch issue. The worker calls its sibling, the sweep
// (check-fleet-preferences.mjs): read every covered member's declaration and write the
// fleet's `preferences` pointer into the ones that lack it.
//
// WHY: personal preferences belong to a FLEET's users — not to any one project, and
// not to the canon, which is shared by every fleet and so is both the wrong host and
// the wrong authority on where they live. Each project therefore carries a POINTER at
// the repo that holds them, and nothing in the canon can populate it: a bootstrap run
// from canon does not know which fleet it is bootstrapping into. The enforcer does —
// it IS the fleet — so the pointer is written from here.
//
// THE ONE SWEEP IN THIS PACK THAT WRITES. The others report a condition and converge
// an issue for a human; this one lands a single additive settings key that carries no
// human decision (the fleet's preferences home is a fact this repo holds), so an issue
// asking someone to copy it into every member would be ceremony around a mechanical
// edit. Hence `expected_outcome: 'none'`: the write goes to OTHER repos, not this one,
// and the outcome ceiling describes what a task may do to its OWN repo — this task
// opens no PR here at all.
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
  id: 'fleet-preferences',
  frequency: 'daily',                    // a member becomes writable the moment its nightly baselining lands the engine that accepts the key — daily is what turns that into "the next morning"
  precondition_signals: [],              // no signal — the sweep reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (agent-preprocessing DESIGN §4)
  expected_outcome: 'none',              // it writes to MEMBERS, never to this repo: no PR here, ever
  agent_preprocessing: 'node worker.mjs',
  // Two or three REST reads per member (declaration, the member's vendored engine, and
  // one PUT for the members being written) plus the enumeration, all serial, with a
  // secondary rate limit making it slower still. The same 900s the other sweeps carry,
  // for the same reason: ~10x the expected walk while staying inside the hourly cadence.
  agent_preprocessing_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT — this sweep needs Contents WRITE on it, unlike the read-only two

  // Fire daily unconditionally. Every input lives OUTSIDE this repo — another member's
  // declaration, another member's vendored engine — and no per-repo collector can see
  // either, so there is no signal that would say in advance whether the answer changed.
  // The sweep is cheap to no-op: a fleet already pointing home reads each member and
  // writes nothing.
  precondition() {
    return { run: true, reason: 'daily fleet preferences sweep (writes the fleet\'s preferences pointer into members that lack it; no-ops on a fleet already pointing home)' };
  },
};
