## 2026-09-14 · born · Member-facing Actions cache advice: the node setup step (#2022)
- **Source:** decision 2 of #2012, limited to what a run or the authoritative docs verify:
  setup-node's own README, whose v5 breaking changes "enabled caching by default with package
  manager detection if no cache input is provided", scoped to a `package.json` whose
  `packageManager` or `devEngines.packageManager` names npm, and whose `cache-dependency-path` note
  gives the key as a hash of the lockfile. The conditional form the rule states inline is the
  chrome-extension package stub's, already live in members, whose own comment records that npm
  caching needs a lockfile.
- **Reason:** v5 caches by itself once `package.json` names `packageManager: npm`, and a cache with
  no lockfile fails the step, so the step declares its caching either way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Retire when:** setup-node caches without a lockfile, or stops enabling itself.
- **Landed:** #2022 (Closes #2019) · pack version 60913.3.
