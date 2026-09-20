## 2026-09-05 · born · converted from references.md (check:synthetic-input-events-bubble)
- **Reason:** `bubbles` defaults to **false** on every DOM event constructor, and a host app handles
  input by delegation from one listener near its own root, so a non-bubbling synthetic event never
  arrives. `dispatchEvent` still returns true, nothing throws and nothing logs — the page simply
  does not respond, which reads as "the app ignores untrusted events" and is an expensive conclusion
  to back out of.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the DOM constructor default stands; retire if it changes or if
  delegation stops being the norm.
