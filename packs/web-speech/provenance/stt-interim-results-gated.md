## 2026-09-05 · born · converted from references.md (check:stt-interim-results-gated)
- **Reason:** Interim hypotheses arrive on the same `result` event as the finished utterance, so
  enabling `interimResults` does not open a second channel — only `isFinal` distinguishes a guess
  from a transcript. A handler that delivers without gating hands the caller a half-heard fragment,
  then the next, several times per utterance: the `"heart heart"` shape.
- **Mechanism:** a check
- **Retire when:** Reaffirm while interim and final share one event; retire if the API separates
  them.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
