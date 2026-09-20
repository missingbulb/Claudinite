## 2026-09-06 · born · converted from references.md (RULES-13)
- **Reason:** Reproduced 2026-09-06: a file whose only occurrence of a command is inside a labeling
  helper's quoted argument (`step "Normalizer self-test — some-cmd --flag"`) answers a plain token
  grep with one hit while the command runs zero times — the check reports the wiring intact after
  the invocation was deleted.
- **Mechanism:** prose
- **Retire when:** Retire the rule if checks stop being written as token greps over script text.
