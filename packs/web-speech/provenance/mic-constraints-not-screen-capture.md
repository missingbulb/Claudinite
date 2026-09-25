## 2026-09-05 · born · converted from references.md (check:mic-constraints-not-screen-capture)
- **Reason:** `suppressLocalAudioPlayback` and `restrictOwnAudio` are `getDisplayMedia`
  screen-capture constraints; `getUserMedia` ignores them with no throw, no warning and no
  `OverconstrainedError`. They are reached for by name by someone hunting their app's own TTS
  leaking back through the mic, so the cost is not the dead property but the application-level echo
  guard (RULES-3) that never gets written.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the constraint names remain `getDisplayMedia`-only; retire if
  `getUserMedia` ever honours them.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
