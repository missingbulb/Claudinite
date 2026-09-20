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
