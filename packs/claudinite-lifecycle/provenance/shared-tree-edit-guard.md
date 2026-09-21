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
