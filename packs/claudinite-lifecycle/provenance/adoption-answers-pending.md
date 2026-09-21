## 2026-07-29 · born · a newly declared pack owes an answer to every question it asks (#401)
- **Reason:** it reconciles an enforcing work check with the standing design where a pending answer
  is only a mild session-start note, so nightly and unattended runs never block: it fires only for a
  pack added on this branch, and a pack already in the base is never re-litigated.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a blocking work-scope check on the adopt-pack skill, reusing the interview state so
  a dependency materialized through `via` asks nothing.
- **Landed:** #401 (Closes #400).

## 2026-08-14 · moved · with the adopt-pack skill it belongs to (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill-owned check moves with its skill, so it keeps riding that skill's
  activation.
- **Landed:** #836 (Closes #835, phase 1).
