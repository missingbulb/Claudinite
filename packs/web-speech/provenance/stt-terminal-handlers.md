## 2026-09-05 · born · converted from references.md (check:stt-terminal-handlers)
- **Reason:** A recognition cycle has three exits and only one is `result`: `end` fires when the
  recognizer closes with nothing (a silent user, an endpoint the engine gave up on, an OS-level
  device grab) and `error` on the named failures, of which `aborted` arrives on every `stop()` and
  every barge-in. A recognizer wired for `result` alone leaves its cycle pending on two of its three
  exits, with the UI still showing a live mic.
- **Mechanism:** a check
- **Retire when:** Reaffirm while all three events can terminate a cycle; retire if the API
  guarantees a single terminal event.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
