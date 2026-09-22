## 2026-09-05 · born · converted from references.md (check:mic-constraints-not-screen-capture)
- **Reason:** `suppressLocalAudioPlayback` and `restrictOwnAudio` are `getDisplayMedia`
  screen-capture constraints; `getUserMedia` ignores them with no throw, no warning and no
  `OverconstrainedError`. They are reached for by name by someone hunting their app's own TTS
  leaking back through the mic, so the cost is not the dead property but the application-level echo
  guard (RULES-3) that never gets written.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the constraint names remain `getDisplayMedia`-only; retire if
  `getUserMedia` ever honours them.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
