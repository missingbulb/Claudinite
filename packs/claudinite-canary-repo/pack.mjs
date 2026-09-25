// claudinite-canary-repo — the live proof that the canon can deliver a workflow file.
//
// It ships one inert workflow and delivers it twice: `seedOps` writes the file at adoption,
// and from pack version 2 on a record re-vendors the same path through the update flow's
// withhold lane. Opt-in, hidden and unfingerprinted; the canary is the only intended holder.
export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'the inert probe workflow the canon delivers to its canary to prove workflow materialization works end to end',
    excludes: 'real CI and release workflows — git-github owns workflow practice, each release pack owns its own pipeline',
  },
  // Not adoptable content: the canary is the only intended holder, so the pack is
  // withheld from the catalog every session reads to route a lesson or pick a pack
  // to adopt. Declaring it by hand still works — that is how the canary holds it.
  hidden: true,
  seededByDefault: false,
  // Seeded, never converged (the install flow is the only reader of this field): the
  // first copy is the member's from the moment it lands. Everything after it is the
  // record's business.
  seedOps: [
    { template: 'stubs/workflows/claudinite-workflow-probe.yml', dest: '.github/workflows/claudinite-workflow-probe.yml' },
  ],
};
