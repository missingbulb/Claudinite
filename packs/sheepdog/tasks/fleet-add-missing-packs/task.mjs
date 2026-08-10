// sheepdog task: fleet-add-missing-packs — get a member declaring the packs it is
// missing. The fourth fleet question, and the first one with an agent stage.
//
// TWO WAYS A PACK COMES TO BE MISSING, and the task is PARAMETERISED over them rather
// than split in two, because they differ only in their first stage:
//   scan_for_needed_packs=true   nobody has decided anything: fingerprint every member's
//                                shape and suspect what its declaration does not carry.
//                                What the weekly run sends.
//   ADD_PACKS=<ids>              the owner already decided: put these packs, with this
//                                config and these interview answers, on these named
//                                repos. What a FORCED run sends, through the scheduler's
//                                manual-run override bag (`CLAUDINITE_OVERRIDES`, which
//                                the prework subprocess inherits) — see worker.mjs for
//                                the full override set and params.mjs for why neither
//                                parameter has a default.
// Both converge the same work-list issues and meet the same second stage.
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
//   prework (deterministic, no agent) — resolve the parameters, then run the half each
//     one asks for: the scan (enumerate the fleet over the PAT, fingerprint every
//     covered member's tree, publish the full roster) and/or the force (vet the named
//     repos and packs, and refuse the whole run if anything is off). Either way it
//     converges one `fleet-add-missing-packs` issue per member with work outstanding,
//     and requests the agent ONLY if there is any.
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
// WHERE THE FLEET REACH COMES FROM: the repo, not any declaration. The agent works
// in MEMBER checkouts, and the enforcer repo's executor session is provisioned with
// the owner's repos — declaring the sheepdog pack IS the statement that this repo
// reaches the fleet, so the dispatch rides the ordinary `ready-for-agent` label like
// every other task's. There is no `session_scope` here and none is wanted: that
// field is deprecated (owner ruling, 2026-08-09; the canon's curation tasks are its
// one standing use), because the executor's access comes from how the repo is
// provisioned, never from what a task asks for.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-add-missing-packs',
  frequency: 'weekly',                   // a repo's shape is slow-moving — the same cadence growth-discover-packs uses for the same reason
  precondition_signals: [],              // no signal — every input is another repo's tree, which no per-repo collector can see
  agent_model: 'sonnet',                 // applies an existing pack by an existing skill; the detecting already happened in prework
  expected_outcome: 'open-pr',           // a new pack ships checks that run in the member's CI — always reviewed, never auto-merged
  agent_instructions: 'task.md',
  // The weekly run's PARAMETERS, sent explicitly on the command line rather than defaulted
  // inside the worker (params.mjs): the declaration is where a reader looks first to learn
  // what the cadence does, so what the cadence does is written here. `all-covered-members`
  // is a keyword the caller sends, not a fallback the worker assumes — no call site can
  // reach the whole fleet by omission.
  prework: 'node worker.mjs --scan-for-needed-packs=true --repos=all-covered-members',
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
  // closes nothing, and the worker then requests no agent at all, so the quiet weeks
  // cost one deterministic sweep and nothing else.
  //
  // A FORCED run never consults this — the engine records a forced task as run with its
  // precondition unevaluated — which is exactly what makes the override bag the way to
  // run this task as something other than its weekly self.
  precondition() {
    return { run: true, reason: 'weekly fleet scan for packs a member is missing (no-ops cheaply on a fleet whose members already declare what their shape suspects)' };
  },
};
