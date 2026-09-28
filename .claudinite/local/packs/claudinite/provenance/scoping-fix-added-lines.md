## 2026-09-28 · born · a destination-only pathspec defeats -M, so a moved file reads as wholly added
- **Source:** capture 2026-09-28 session f6b90b34 (#2383), where a sweep over `git diff --cached -M
  -U0 HEAD -- packs/claudinite-tasks/tasks/usage-fold` rewrote 62 lines across five files `git mv`
  had moved into that folder; reproduced here in a scratch repo.
- **Reason:** the pathspec hid the rename's source side, so the destination read as a new file and
  the sweep's own scope silently became every line of it; the recovery was a `git checkout --` of
  five modules, and nothing failed to say the scope was wrong.
- **Mechanism:** prose. The wrong scope is a property of the change in flight - which files it moved
  - and no pattern over a command string can see it, while an action guard reading `git status` per
  Bash call buys a subprocess on every call for a case a pathspec usually means.
- **Actor:** the growth-extract run over the 2026-09-28 window, work item #2386.
- **Model:** claude-opus-5
- **Retire when:** the long-dash and comment sweeps this repo runs read their scope from `git diff
  --name-status` rather than from a pathspec-narrowed added-line set.
