## 2026-07-03 · born · Promote portable lessons from GoogleCalendarEventCreator's local docs (c90f0c51)
- **Source:** GoogleCalendarEventCreator's local docs, phase 2 of the growth lifecycle.
- **Reason:** git already knows what the repo owns, so a `git ls-files` file set needs no exclude
  path to maintain and cannot desync when an artifact moves.
- **Mechanism:** prose, in `textAndFileManipulation.md`.
- **Landed:** commit c90f0c51.

## 2026-09-05 · moved · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the writing-repo-scanning-checks skill, triggered on "Choosing the
  file set".
- **Landed:** #1667 · pack version 60904.3.
