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

## 2026-09-22 · policy-changed · one settings-file name, now the rename's window has passed (#1919)
- **Reason:** `.claudinite-checks.json` was read everywhere beside `.claudinite-settings.json` while
  members converged onto the new name, and every reader that asked "is this the declaration" carried
  its own copy of the two-name loop. The convergence window `legacy-shape-in-use` opened has passed,
  so each of those readers now names one file. A member still carrying the retired name reads as
  having no declaration at all - the stated cost of the retirement, and why its policy is nothing.
- **Mechanism:** the reader takes `SETTINGS_FILE` rather than iterating `SETTINGS_FILES`, which is
  now a one-element list kept only as a link-time shim for fielded pack versions (#1911).
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1919
