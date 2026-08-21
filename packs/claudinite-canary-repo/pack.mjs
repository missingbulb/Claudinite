// claudinite-canary-repo — the live proof that the canon can deliver a workflow file.
//
// THE THING IT PROVES. `.github/workflows/` is the one directory the nightly update
// can never push to: it commits with the Action's `GITHUB_TOKEN`, which GitHub refuses
// under that path, and the refusal rejects the whole ref rather than the one file. The
// pack update flow answers that with the WITHHOLD lane — every write bound for
// `.github/workflows/` is diverted to `.claudinite/pending-workflows/`, staged into the
// maintenance PR as an ordinary added file, and the update ends at `apply-stage` until a
// session with an MCP credential moves it into place (#649).
//
// That lane had one exercised caller: the scheduler workflow's own convergence. A
// RECORD'S `materialize` shares the same `write`, and had never run against a live
// member — which is the residual #649 reopened for. This pack is the thing that makes
// it runnable: an inert workflow, delivered to a real repo by the real lane, whose
// content the canon then changes so the delivery has to happen again.
//
// WHY A PACK AND NOT A FIXTURE. The lane's failure mode is precisely what a fixture
// cannot see — a token's refusal, on a real push, against a real repository. A hermetic
// rehearsal proves the staging directory got a file; only a member proves the file
// arrives in `.github/workflows/`. So the probe has to be adoptable content that a
// member really declares, and adoptable content in this corpus is a pack.
//
// OPT-IN, AND EXPECTED NOWHERE BUT THE CANARY. `seededByDefault: false` with no
// fingerprint, so `--init` never seeds it and no scan ever suspects it: a repo carries
// this only because someone declared it. The canary is the intended and only holder —
// it is disposable by construction, which is the whole reason the fleet has one.
//
// THE WORKFLOW IT SHIPS IS INERT BY DESIGN. `workflow_dispatch` and nothing else: no
// schedule, no push, no pull_request. What is under test is whether the FILE arrives,
// not whether it runs, and a probe that consumed a member's Actions minutes on every
// push would be paying for an answer it does not need.
//
// TWO DELIVERY ROUTES, DELIBERATELY. The `seedOps` entry below puts the workflow in at
// ADOPTION — written by the install flow and committed by the adopting session, which
// holds a credential the Action token is not. That is the easy half, and it is not the
// thing #649 doubted. The hard half arrives with pack version 2 — a record whose
// `materialize` re-vendors the same path through the withhold lane.
//
// THE VERSIONS ARE THE SEQUENCE, not bookkeeping. An install stamps the newest version
// and runs no records (`updates/install.mjs`), so a record shipped in the version a repo
// adopts at is a record that repo can never reach: `migrationApplies` is `want > have`.
// The probe is therefore adopted at version 1, which seeds the file and nothing else,
// and the record lands at version 2 so the update flow really has a gap to close. It
// also means the record's job is to UPDATE a workflow that is already there — the exact
// shape a fleet-wide workflow fix would take.
export default {
  id: 'claudinite-canary-repo',
  // 4: renamed from `canary-probe` — the pack's subject is a Claudinite feature, so
  // it carries the prefix that says so.
  version: '60821.1',
  minEngineVersion: 3,
  ruleRoutingGuidance: {
    belongs: 'the inert probe workflow the canon delivers to its canary to prove workflow materialization works end to end',
    excludes: 'real CI and release workflows — git-github owns workflow practice, each release pack owns its own pipeline',
  },
  badge: 'badge.svg',
  // Not adoptable content: the canary is the only intended holder, so the pack is
  // withheld from the catalog every session reads to route a lesson or pick a pack
  // to adopt. Declaring it by hand still works — that is how the canary holds it.
  hidden: true,
  detect: null,
  marker: null,
  seededByDefault: false,
  prose: null,
  // Seeded, never converged (the install flow is the only reader of this field): the
  // first copy is the member's from the moment it lands. Everything after it is the
  // record's business.
  seedOps: [
    { template: 'stubs/workflows/claudinite-workflow-probe.yml', dest: '.github/workflows/claudinite-workflow-probe.yml' },
  ],
  worldRules: [],
};
