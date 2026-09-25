## 2026-09-21 · born · opening the file so a later entry has somewhere to land
- **Source:** the backfill brief, which found no commit adding this skill under its current path —
  its earliest pack-local evidence is the version-bump commit ea4b096, so this date is DERIVED
  rather than observed and the element is older than it.
- **Reason:** the file was empty, and an entry owed by a change to the skill cannot be the first
  entry on a file. This opens it and claims nothing about why the skill was written; the basics
  pack's own backfill pass is what can answer that, across all 134 of its empty files at once.
- **Mechanism:** the improve-comments skill, body workflow, reached by its description.
- **Actor:** run of the session that shortened the description (@missingbulb, owner).
- **Model:** claude-opus-5
- **Landed:** commit ea4b096 · pack version 60903.2.

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · scope-changed · the pass may improve comments under .claudinite/local/
- **Reason:** the owner narrowed the exclusion to the vendored `.claudinite/shared/`; the repo's
  local packs are its own source. The path-naming advice now follows the rewritten writing-comment
  rule.
- **Mechanism:** the skill's leave-alone list and the task's `commits-outside:.claudinite/shared/`
  precondition.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
