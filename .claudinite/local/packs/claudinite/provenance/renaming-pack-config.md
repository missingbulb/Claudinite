## 2026-09-01 · born · converted from references.md (RULES-27)
- **Reason:** #1081: the rename map fixes code-side id resolution but cannot rewrite a member's own
  already-committed config, which converges on its own schedule or never; rewriting the write side
  reaches only data the engine itself owns.
- **Mechanism:** prose
