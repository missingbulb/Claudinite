## 2026-09-18 · born · converted from references.md (check:gp/site-config)
- **Reason:** The publish set is deliberately **additive**, and the check makes the cost of that
  choice survivable. The rejected alternative — "publish the repo except the tooling" —
  publishes every draft, note and key nobody thought to exclude, and publishes each *new* one
  silently the day it lands. Additive inverts the failure: a forgotten entry is a missing page, and
  the check catches a path that matches nothing tracked, a tooling directory in the set and a set
  with no `index.html` before any of them reaches the default branch.
- **Mechanism:** a check
- **Retire when:** Retire it if the artifact ever stops being built from an explicit list.
