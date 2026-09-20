## 2026-09-06 · born · converted from references.md (check:cross-repo-verify-line)
- **Reason:** Three ad-hoc cross-repo `Verify:` items each parked on a scope denial minutes after
  being picked (#1349, #1351, #1396) — the executor provisions agent sessions with this repo's
  scope only. The coded form has the same wall for anything but a public unauthenticated URL, which
  #1790 crossed with an `api.github.com` probe (#1792), so the guard watches the probe lines too.
- **Mechanism:** a check
- **Retire when:** Retire the rule only if executor sessions gain cross-repo scope and probes gain a
  credential.
