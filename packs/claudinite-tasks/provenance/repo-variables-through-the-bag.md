## 2026-09-16 · born · Read the operator hold from the vars bag, and check that no code reads a repository variable over the REST API (#2088)
- **Source:** every executor drain in every member logging, after its first item, that the
  suspend-all hold is not readable live by the run's token.
- **Reason:** the Actions `GITHUB_TOKEN` is refused on the REST variables route in every member and
  no `permissions:` key grants it, so the read never answers and costs a call and a log line per run
  while the value the run started with is the one that decides. Every repository variable already
  travels in the executor's vars bag, so nothing needed the API.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a declared check in `packs/claudinite-tasks/declared-checks.json`, so every member
  declaring the pack runs it over its own local packs - a member's own local task is where the next
  such read gets written. Blocking after the standard grace window; authored first and watched fire
  on the executor's own read before the fix.
- **Landed:** #2088 · pack version 60916.1.
