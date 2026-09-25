## 2026-09-05 · born · converted from references.md (check:synthetic-input-events-target-app-node)
- **Reason:** The same silent failure from the other direction: a bubbling event only reaches the
  delegated listener when its target sits inside that listener's subtree, so aiming one at
  `document` or `document.body` dispatches it from outside the app root and it bubbles straight
  past. Scoped to the interfaces that model real user input, since a `CustomEvent` at `document` is
  your own signal to your own listener and has no delegation contract to hold it to.
- **Mechanism:** a check
- **Retire when:** Reaffirm on the same terms as the bubble check.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
