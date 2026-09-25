## 2026-07-09 · born · Add string-aware stripComments helper; scan code not prose (#200)
- **Reason:** a comment that merely names a banned token fails the build over an English sentence,
  and the next author who documents the rule being enforced trips it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose beside the shared `stripComments` helper the corpus ships for it.
- **Landed:** #200.

## 2026-09-05 · moved · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the writing-repo-scanning-checks skill, triggered on "Scanning for a
  forbidden token".
- **Landed:** #1667 · pack version 60904.3.
