## 2026-09-01 · born · converted from references.md (RULES-31)
- **Reason:** #1004: a converged tree carried the new engine beside the old `core` pack, whose file
  still imported `engine/scheduler/slots.mjs`; the pack failed to load, the mount's self-test
  failed, and the converge refused to land — a green run, an unmoved stamp and a `needs-human` PR.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if the engine and pack lanes deliver atomically.
