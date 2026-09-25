## 2026-09-05 · born · converted from references.md (check:stt-error-map-has-default)
- **Reason:** The Web Speech error-name set is open: it is a spec enum today, but Chrome has shipped
  names outside the original list and a vendor-prefixed engine can invent one at any release. A
  mapping switch with no `default:` arm returns `undefined` for such a name, every downstream
  comparison on the kind is then false, and the dialog policy silently takes its do-nothing arm.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the error vocabulary can grow; retire if the set is closed and
  versioned.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
