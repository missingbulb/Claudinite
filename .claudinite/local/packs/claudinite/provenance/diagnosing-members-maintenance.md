## 2026-09-08 · born · converted from references.md (RULES-82)
- **Reason:** Investigation over three members, 2026-09-07 (#1882): GitHub creates the
  `pull_request` run for a `GITHUB_TOKEN` push and parks it `action_required`, so the gated run is
  the only check on a maintenance PR and the banner reads "1 workflow awaiting approval" —
  measured cost, ~21h on missingbulb/Shepherd#477 and an owner round-trip on
  missingbulb/GoogleCalendarEventCreator#1185. The parked run never executes; the real CI is the
  `workflow_dispatch` run the queue starts on the same head sha (`land-pr.mjs:602`). The rule's
  prior "not a missing repo setting" was false: Actions → General → *Approval for running fork
  pull request workflows from contributors* = **Require approval for first-time contributors** is
  what parks it. Loosening that per member was weighed and declined (owner, 2026-09-07) because the
  gate delays by one cycle without losing a merge — missingbulb/GoogleCalendarEventCreator#1160
  had a green dispatch run beside a gated phantom and merged on the next cycle.
- **Mechanism:** prose
- **Retire when:** Retire the rule if that setting stops gating same-repo bot PRs, or if the queue
  stops dispatching its own runs.
