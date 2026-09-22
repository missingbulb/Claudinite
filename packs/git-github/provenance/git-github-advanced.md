## 2026-09-14 · born · converted from references.md (git-github-advanced-1)
- **Reason:** GitHub's *Caching dependencies to speed up workflows* doc, "Restrictions for accessing
  a cache" and "Cache access for low-trust workflow triggers": a `pull_request` run's cache is
  created for `refs/pull/.../merge` and restorable only by re-runs of that PR; only `push`,
  `workflow_dispatch`, `repository_dispatch`, `delete`, `registry_package`, `page_build` and
  `schedule` may write the default branch's scope, every other trigger resolving there is read-only
  and a refused save "is reported as a warning in the workflow log"; entries "not accessed in over 7
  days" are removed. Read for #2012, where the read-only case is the executor's own `issues:
  labeled` trigger.
- **Mechanism:** a step of the git-github-advanced skill, a workflow
- **Retire when:** Retire when GitHub drops the low-trust restriction or the 7-day eviction.

## 2026-09-21 · strengthened · two member guards the skill had no line for
- **Source:** two members' local packs, read by the `growth-promote` task's 2026-09-21 window:
  Shepherd's `branch-from-local-main` guard, and a measured `tail_lines: 2406` overflow in
  GoogleCalendarEventCreator.
- **Reason:** the skill already warned that a remote merge leaves `origin/main` behind until it is
  fetched, which reads as a rule about the moment just after a merge; Shepherd's guard is the worse
  case that wording does not reach, a long-lived unattended checkout whose local `main` nothing ever
  fast-forwards, so it sits arbitrarily stale rather than one merge behind. The artifact-URL line
  said to read the log with a generous `tail_lines`, which is the advice that failed: the parameter
  is unbounded on the request side, so a guessed-large value blows the tool's own token limit and
  fails the exact call meant to diagnose the failure.
- **Actor:** the `growth-promote` task, which folded each lesson into the canon doc already owning
  the topic rather than minting a pack or a check.
- **Landed:** #2206 (Refs #2194).
