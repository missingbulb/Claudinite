## 2026-08-17 · born · getting a packSeeds entry right before the sweep runs (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions.
- **Reason:** the sweep seeds and never overrides, so a wrong seed reaches each member once and then
  sticks; correcting it here un-writes nothing and undoing it is a change in every member's repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Adding or changing a packSeeds entry".
- **Landed:** #958 (Closes #954).

## 2026-09-05 · moved · out of RULES.md into the configuring-the-fleet skill (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `configuring-the-fleet` skill, which is force-loaded on any edit
  of `.claudinite-settings.json`; the rule's own text is unchanged.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
