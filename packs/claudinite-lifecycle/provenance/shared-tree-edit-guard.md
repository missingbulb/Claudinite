## 2026-09-06 · born · the mount is guarded at the tool call (#1285)
- **Source:** the prose-to-checks sweep's own worklist, converting the rule that says a vendored
  file is changed in the canon.
- **Reason:** this is the moment that matters: it stops the write instead of reporting it
  afterwards.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declared action guard denying a file-writing tool aimed inside the mount, and the
  shell writes that reach the same tree. Its Stop-time backstop is a separate work-scope module,
  which cannot be a declaration because the mount is filtered out of the scanned set and every
  path-matching work key is blind there by construction.
- **Rejected:** deleting the prose the guard converts. The paragraph carries something neither check
  does, where a vendored rule lives, and a guard that speaks only once an edit is aimed at the tree
  never answers that.
- **Landed:** #1285 (Refs #1274) · pack version 60906.10.

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

<<<<<<< HEAD
## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
=======
## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
>>>>>>> b51f2317 (Say "update" where live prose meant the nightly converge)
