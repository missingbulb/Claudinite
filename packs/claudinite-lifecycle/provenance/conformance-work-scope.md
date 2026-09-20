## 2026-09-01 · born · converted from references.md (check:conformance-work-scope)
- **Reason:** #939: canon content edited without a version move shipped to nobody for five days
  across seven repos while every whole-tree check stayed green — only a change-scoped sweep can
  see "did THIS change move it".
- **Mechanism:** a check
- **Retire when:** Retire the check only if the tree itself can show a missing per-change move.
