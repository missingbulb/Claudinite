## 2026-09-06 · born · converted from references.md (RULES-74)
- **Reason:** #1317's chain: L1–L3 were driven to their exit conditions by the nightly converge
  rather than by anyone working the links, and the L4 deletion landed in the canon on 2026-08-24
  without its own PR (#1329 closed unmerged). Thirteen days later every one of the six issues still
  read `blocked`, and two prior triage passes reaffirmed that reading from the issues alone; the
  fleet check that settled it took one shallow clone per member.
- **Mechanism:** prose
- **Retire when:** Retire the rule if a mechanism starts closing a chain link when its exit
  condition is observed.
