## 2026-09-06 · born · converted from references.md (check:github-api-via-shell)
- **Reason:** #880: `Monitor` and shell poll loops reported "still running" until they timed out,
  ~26 minutes lost across two PRs that were already green. The cause is authorization, not egress:
  probed 2026-09-06, `api.github.com` resolves and `/rate_limit` answers 200, while every
  repo-scoped path — this repo's own, and a public one — 403s with "GitHub access is not enabled
  for this session". That asymmetry is why a reachability probe reassures while the real call still
  fails. The guard's other arm holds for a different reason — `gh` is simply absent from `PATH`
  — so the message names both.
- **Mechanism:** a check
- **Retire when:** Retire the rule only if repo-scoped calls start answering from the shell and a
  `gh` CLI is installed.
