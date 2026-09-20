## 2026-09-06 · born · converted from references.md (RULES-71)
- **Reason:** #1790 filed janitor rule I's verification against `missingbulb/TLDR#275` with a coded
  probe on `api.github.com`: `verify-production`'s `fetchOnce` sends no credential, so that read
  answers anonymously — rate-limited from an Actions runner, and 404 for anything not public —
  and the item could only re-arm every 6 hours forever (#1792). The owner's ruling, 2026-09-06: "You
  either find a similar issue locally, or create the test-in-prod issue on the target repo", and it
  is this repo's rule rather than a canon one because other members' routines may hold wider scope.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the executor's sessions and probes gain credentialed
  cross-repo reads.
