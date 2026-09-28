
// The basics pack: cross-project working discipline, the task lifecycle, and the general
// engineering skills. Active only where a repo declares it, and never fingerprinted.
//
// Its skills/ holds the general engineering practice any project's work can call for, whatever
// its technology, mounted wherever this pack is declared.
export default {
  // A migration record's declared `version` must be ≤ this number, and this number must
  // MOVE for that record to reach a member already at the previous one:
  // `migrationApplies` is `want > have` against the stamped version, and what gets
  // stamped is this manifest's number — so a record declaring a version above it would
  // re-apply every cycle, forever, draining never.
  version: '60927.3',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'cross-project working discipline, issue-branch-PR lifecycle, repo hygiene, doc/reference integrity and the general engineering, testing and debugging skills',
    excludes: 'technology-specific content — its own tech pack; git procedure and GitHub Actions workflow or platform behaviour — git-github',
  },
  pitch: 'The working discipline every session follows, whatever the repo builds. Some sixty rules make Claude start from the problem, prove each change works now rather than later, fix warnings at their cause and track work through pull requests. Well over a dozen skills cover bug investigation, committing, writing trustworthy tests, planning migrations and verifying changes in production. Dozens of checks hold the discipline in place, and a pair of scheduled tasks look into CI that got slower and improve the repo\'s comments without anyone asking.',
  seededByDefault: true,
  // `claudinite-lifecycle` is required rather than assumed: this pack is declared everywhere, so
  // the closure is what puts Claudinite's own rules in front of every session.
  // git-github carries the git/GitHub side of the task lifecycle (#385).
  requires: ['claudinite-lifecycle', 'git-github'],
  // `ci-performance` and `improve-comments` are this pack's scheduled tasks,
  // discovered by the scheduler's filesystem scan (packs/claudinite-tasks/discover.mjs)
  // rather than declared here, as its rules are from `worldRules/`, `workRules/`
  // and `declared-checks.json`.
};
