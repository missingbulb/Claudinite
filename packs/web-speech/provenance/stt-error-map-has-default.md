## 2026-09-05 · born · converted from references.md (check:stt-error-map-has-default)
- **Reason:** The Web Speech error-name set is open: it is a spec enum today, but Chrome has shipped
  names outside the original list and a vendor-prefixed engine can invent one at any release. A
  mapping switch with no `default:` arm returns `undefined` for such a name, every downstream
  comparison on the kind is then false, and the dialog policy silently takes its do-nothing arm.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the error vocabulary can grow; retire if the set is closed and
  versioned.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
