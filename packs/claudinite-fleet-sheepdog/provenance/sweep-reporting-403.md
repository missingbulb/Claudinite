## 2026-08-19 · born · a 403 names the permission that would fix it (#1052)
- **Reason:** a bare status deep in a sweep sends the reader hunting. Attributing the failure to a
  permission is the cheaper half of a preflight: no extra requests, and it reports on the call that
  actually failed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "A sweep reporting 403 or no-permission", with the
  attribution rendered from the single grant table.
- **Rejected:** a preflight probe per permission. It cannot be accurate where it matters: the
  permission that was missed fails only on a private member, so a probe against the enforcer's own
  repo passes on a grant that later 403s, and a probe against a private member is the same request
  the sweep is about to make anyway.
- **Landed:** #1052 (Fixes #1030) · pack version 12.
