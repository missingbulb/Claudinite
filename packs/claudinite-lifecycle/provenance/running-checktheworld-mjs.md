## 2026-09-06 · born · converted from references.md (RULES-2)
- **Reason:** Probed 2026-09-06: `node engine/checks/check_the_work.mjs` on a clean tree wrote 0
  bytes and exited 0. A run read as a stall costs a second pass of `--help`/`head`/`tail` hunting
  for confirmation.
- **Mechanism:** prose
- **Retire when:** Retire the rule if either entry point starts printing a clean-result line.
