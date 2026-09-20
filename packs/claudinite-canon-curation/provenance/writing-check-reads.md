## 2026-09-04 · born · converted from references.md (RULES-6)
- **Reason:** `comment-classification` blocked a session on `[Request interrupted by user for tool
  use]`, read as the owner's latest comment, because `humanText` drops an entry starting with `<`
  and lets a bracketed marker straight through.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if the helper stops screening by that first character.
