// sheepdog task: fleet-fit — does each covered member declare the packs its SHAPE
// suspects? The fourth fleet question, and the first one with an agent stage.
//
// WHY: a pack's `detect` fingerprint is consulted exactly ONCE, at bootstrap's
// `--init`. Baselining backfills the seeded packs and each declared pack's `requires`
// closure; it never re-fingerprints. So a member that grows into a pack after
// adoption — adds a package.json, a firebase.json, a Chrome manifest — is never told
// the pack exists, and the owner has to already know what to ask for. The census asks
// "is this repo a member"; freshness asks "is that membership still meaning
// anything"; both take the declared pack set as given. This asks whether that set
// still matches the repo.
//
// TWO STAGES, and the split is the point:
//   prework (deterministic, no agent) — enumerate the fleet over the PAT, run every
//     canon fingerprint against every covered member's tree, converge one `fleet-fit`
//     issue per member with undeclared fits, publish the full roster.
//   agent (sonnet) — take the accepted suspicions and ACT on them: adopt-pack against
//     the member, per task.md.
// Everything decidable in code stays in code; the agent is reached only for the part
// that is a judgment and a repo edit.
//
// WHY sonnet and not opus: the detecting is done by the time the agent starts — the
// fingerprint found the shape, the pack's own README states its boundary, and
// adopt-pack is an existing procedure with an existing checklist. This applies a pack;
// it does not author one (which is why growth-discover-packs is opus). The judgment
// left is "is this fingerprint's suspicion actually right for this repo", which is
// bounded and, being ceilinged at `open-pr`, always lands in front of a reviewer.
//
// WHY expected_outcome: 'open-pr' and never merged-pr: declaring a pack turns on
// conformance checks that run in that member's CI and at every Stop from the moment
// they land. A wrong or over-eager declaration therefore breaks a repo with nobody
// having looked — the same reason growth-discover-packs and prose-to-checks-sweep are
// reviewed. The ceiling is enforced in code (verify-outcome.mjs), so this line is
// what actually keeps auto-merge off the PR.
//
// WHY session_scope: 'fleet' — unlike this pack's other three tasks, the reach here
// is in the WIRING, not just the implementation: the agent works in MEMBER
// checkouts, so its session needs the owner's repos in its sources. That routes the
// dispatch to `ready-for-agent-fleet`, which requires a fleet executor routine in the
// enforcer repo (packs/basics/scheduled-tasks.md) — declaring the scope does not
// create it. Without that routine the dispatch is filed and never runs.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-fit',
  frequency: 'weekly',                   // a repo's shape is slow-moving — the same cadence growth-discover-packs uses for the same reason
  precondition_signals: [],              // no signal — every input is another repo's tree, which no per-repo collector can see
  agent_model: 'sonnet',                 // applies an existing pack by an existing skill; the detecting already happened in prework
  expected_outcome: 'open-pr',           // a new pack ships checks that run in the member's CI — always reviewed, never auto-merged
  agent_instructions: 'task.md',
  session_scope: 'fleet',                // the agent edits MEMBER repos → the fleet executor, not the self one
  prework: 'node worker.mjs',
  // One tree listing per member plus a bounded handful of content reads per
  // content-reading fingerprint, all serial, with a secondary rate limit on top. The
  // same 900s the census and freshness sweeps carry, for the same reason: ~10x the
  // expected walk while staying well inside the hourly cadence.
  prework_timeout: 900,
  // Adopting a pack into a member is a checkout, an interview, a re-vendor, a
  // scaffold and a PR — per member with findings. Generous, because it is a runaway
  // bound and not a scheduling knob.
  agent_execution_timeout: 3600,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT the sweep reads the fleet with

  // Fire weekly unconditionally. Every input lives OUTSIDE this repo — another
  // member's tree, another member's declaration — and no per-repo collector can see
  // any of them, so there is no signal that would tell us in advance whether the
  // answer changed. Cheap to no-op: a fleet that declares what it should opens and
  // closes nothing, and the agent stage finds no open fit issue and stops.
  precondition() {
    return { run: true, reason: 'weekly fleet pack-fit sweep (no-ops cheaply on a fleet whose members already declare what their shape suspects)' };
  },
};
