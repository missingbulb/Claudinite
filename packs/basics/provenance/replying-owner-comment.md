## 2026-09-17 · born · converted from references.md (RULES-6)
- **Reason:** The continuation clause only. A `missingbulb/EdFringeNow` session opened on "Let's
  move from github pages to deploy to Cloudflare. Adopt the relevant package and lets go", replied
  with the session-start summary line and `**Comment class: process-change**`, and ended the turn:
  one assistant message, `stop_reason` `end_turn`, zero thinking tokens, no tool call. Every
  instruction governing that reply said what it must open with and none said it continues, so the
  reply was complete by its own rules and empty of work.
- **Mechanism:** prose
- **Retire when:** Retire if the instructions a first reply answers to ever state their own
  continuation.
