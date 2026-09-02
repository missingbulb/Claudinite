// claudinite-fleet-sheepdog task: fleet-add-missing-packs — get every member declaring the packs it
// is missing. The fourth fleet question, now fully on the FAN-OUT model (#749).
//
// `agent_model: 'none'` — this task runs no agent, HERE. Its first incarnation ended
// in an enforcer-side agent stage that ran adopt-pack against members, and it failed
// in production the first time it ran: the enforcer's executor is (correctly) scoped
// to the enforcer repo alone, and "the enforcer's session is provisioned with the
// fleet" turned out to be an assumption, not a fact. The agentic work moved to where
// the access already is: each member's own adopt-requested-packs task
// (claudinite-growth). This task DISPATCHES — it converges a work-list issue in
// the member and fires that member's scheduler — and the member EXECUTES, with the
// repo checked out, under its own declaration's guards. No agent anywhere needs
// cross-repo access.
//
// TWO WAYS A PACK COMES TO BE MISSING, and the task is PARAMETERISED over them
// rather than split in two, because they differ only in how the work list is made:
//   scan_for_needed_packs=true   nobody has decided anything: fingerprint every
//                                member's shape and SUSPECT what its declaration
//                                does not carry. What the weekly run sends.
//   ADD_PACKS=<ids>              the owner already decided: REQUEST these packs,
//                                with this config and these interview answers, in
//                                these named repos. What a FORCED run sends, through
//                                the item's Context — see worker.mjs for
//                                the full override set and params.mjs for why
//                                neither parameter has a default.
// Both converge the same protocol issues (protocol.mjs) and fire the same
// member-side task.
//
// WHERE THE FLEET REACH COMES FROM: FLEET_GITHUB_TOKEN, the account-spanning PAT —
// with Actions WRITE, because firing another repo's scheduler is an Actions write.
// No session scope, no executor grant: the one credential is the PAT, and the only
// things that cross a repo boundary are an issue and a workflow_dispatch.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-add-missing-packs',
  frequency: 'weekly',                   // a repo's shape is slow-moving — the same cadence growth-discover-packs uses for the same reason
  // Fire weekly unconditionally. Every input lives OUTSIDE this repo — another
  // member's tree, another member's declaration — and no per-repo collector can
  // see any of them, so there is no signal that would say in advance whether the
  // answer changed. Cheap to no-op: a fleet that declares what it should converges
  // nothing and fires nobody.
  //
  // A hand-created item runs against this too, and it says yes — so what makes a
  // forced run different is its Context, not a bypass: the parameters there are
  // what run this task as something other than its weekly self.
  preconditions: ['none'],
  agent_model: 'none',                   // pure code here: scan/request, converge member issues, fire member schedulers — the AGENT is the member's own
  expected_outcome: 'none',              // it writes issues in MEMBERS and queues their runs; no PR here, ever
  // The weekly run's PARAMETERS, sent explicitly on the command line rather than
  // defaulted inside the worker (params.mjs): the declaration is where a reader looks
  // first to learn what the cadence does, so what the cadence does is written here.
  // `all-covered-members` is a keyword the caller sends, not a fallback the worker
  // assumes — no call site can reach the whole fleet by omission.
  code_work: 'node worker.mjs --scan-for-needed-packs=true --repos=all-covered-members',
  // One tree listing per member plus a bounded handful of content reads per
  // content-reading fingerprint, plus the per-member issue convergence and one
  // dispatch POST per member with findings, all serial with a secondary rate limit.
  // The same 900s the other sweeps carry: ~10x the expected walk.
  code_work_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT; fleet-token.mjs states the grant
};
