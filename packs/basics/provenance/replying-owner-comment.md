## 2026-07-17 · born · Interactive-comment routing: three-mode prose + conversation-surface checks (#311)
- **Reason:** the classification decides where the change lands and what must exist before any fix,
  so it has to be declared before the work rather than inferred after it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, with the `comment-classification` check reading the declared line.
- **Landed:** #311.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Replying to an owner comment".
- **Landed:** #760, closing #759 · pack version 1.

## 2026-08-16 · reworded · Audit basics/RULES.md, and teach authoring-agent-docs what this rewrite needed (#894)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #894 · pack version 3.

## 2026-09-17 · reworded · Make a session's first reply carry its work, not just its announcements (#2111)
- **Reason:** the continuation clause only. The EdFringeNow session that prompted it replied with
  the session-start summary line and the class line and ended the turn, complete by its own rules
  and empty of work, because every instruction governing that reply said what it must open with and
  none said it continues.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Retire when:** the instructions a first reply answers to ever state their own continuation.
- **Landed:** #2111 · pack version 60917.1.
