## 2026-09-05 · born · converted from references.md (RULES-3)
- **Reason:** Deprecated is not unread. `keyCode`/`which`/`charCode` are deprecated in the DOM spec
  but still populated by the browser on every real keystroke, and hosts with a long-lived
  key-handling layer still branch on them — CrosswordChat's does. A synthetic event defaults them
  to 0, which matches no branch, so the host's handler runs and does nothing, presenting exactly as
  "the app rejects untrusted events".
- **Mechanism:** prose
- **Retire when:** Reaffirm while the legacy fields remain populated on real events; retire once
  browsers stop setting them.
