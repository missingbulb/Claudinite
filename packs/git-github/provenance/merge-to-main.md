## 2026-09-01 · born · converted from references.md (merge-to-main-1)
- **Reason:** The capture step runs **here, in-session, because it needs the live transcript** —
  nothing later can reach it, which is why this is a step of the merge rather than something
  scheduled. Extraction is deliberately not done here: the lessons pass happens later in the
  `claudinite-growth` pack's `growth-extract` task, over the captured logs, so this step stays
  deterministic and seconds-long. Recovered from the skill's own pre-#1092 text, cut when
  `verify-in-production` was split out of this skill (`8da4c916`).
- **Mechanism:** a step of the merge-to-main skill, a workflow
- **Retire when:** Reaffirm while `capture-log.mjs` reads the session transcript and
  `growth-extract` owns the conversation half; retire if capture stops needing a live session.

## 2026-09-20 · reworded · the sync-main step became a conditional note
- **Reason:** the merge is normally a session's last act — an unattended run has no further work
  and an interactive one rarely does — so syncing `main` unconditionally spent a step on a
  checkout nobody read next. Loading the skill puts the sync in context for the session that does go
  on to more work, which is all that case needs.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
