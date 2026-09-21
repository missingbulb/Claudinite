## 2026-08-17 · born · keeping a repo out of the fleet (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions.
- **Reason:** nothing else opts a repo out. An archived or forked repo is reported as out of scope
  but still walked, and one that never adopted is a finding rather than a choice.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Keeping a repo out of the fleet".
- **Landed:** #958 (Closes #954).

## 2026-09-05 · moved · out of RULES.md into the configuring-the-fleet skill (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `configuring-the-fleet` skill, which is force-loaded on any edit
  of `.claudinite-settings.json`; the rule's own text is unchanged.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
