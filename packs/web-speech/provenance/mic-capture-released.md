## 2026-09-05 · born · converted from references.md (check:mic-capture-released)
- **Reason:** A `getUserMedia` stream is freed only by stopping its tracks: dropping the reference,
  closing an `AudioContext` or unsetting a `srcObject` frees nothing, and both the browser's
  recording indicator and the OS microphone indicator stay lit. On a voice app that is the most
  alarming possible bug — it looks to the user like the app is still listening. File-scoped rather
  than flow-scoped on purpose: proving a particular stream is stopped needs real data-flow analysis,
  and a check that guesses is worse than one asking an honest question.
- **Mechanism:** a check
- **Retire when:** Reaffirm while track-stopping is the only release; retire if streams gain
  deterministic collection.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
