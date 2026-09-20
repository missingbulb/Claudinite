## 2026-09-01 · born · converted from references.md (RULES-16)
- **Reason:** #1069: the writing-tasks workflow carve-out justified itself on two grounds that are
  false, because code-work runs inside the executor's own Action job — it declares
  `code_work_required_secrets`, and `id-token: write` is one line in that job's `permissions:`.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if code-work stops running Action-side.
