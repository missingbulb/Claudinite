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

## 2026-09-22 · reworded · four tool-surface traps promoted, and the page-size note corrected (#1886)
- **Source:** GCEC, EdFringeNow, Shepherd and ClaudiniteWebsite runs.
- **Reason:** four failures that cost a round-trip each and leave no error behind, which is what
  earns them a place here: `list_pull_requests`'s `head` filter returns an unrelated pull request
  for a bare branch name rather than declining; `search_code`'s index lags far enough behind a
  repo's content to undercount a fleet sweep; the rendered pull request diff omits a new root-level
  file that is genuinely in the commit; and a spilled overflow file for a search is GitHub's own
  envelope rather than a bare list, so the first parse should index `items`.
- **Mechanism:** sections and bullets on this workflow skill, whose body is the element - the traps
  are only actionable while a run is already reaching for these tools.
- **Rejected:** this branch also carried a claim that `list_workflow_runs` ignores the page size
  entirely, contradicting the measurement already on this skill. The contradiction resolved in
  favour of the measurement: the tool reads `perPage`, and the branch's evidence is what passing
  `per_page` produces. One sentence naming that spelling was added to the surviving bullet, which
  neither side had. The branch's own re-sharpening of the artifact-download note was dropped as
  already landed.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
## 2026-09-22 · reworded · four more tool-surface traps, from a later promotion cycle (#2032)
- **Source:** Shepherd, EdFringeNow and GCEC runs.
- **Reason:** four failures that each cost a round-trip and leave no usable error: citing an issue
  or pull request number before the object exists, since both share one counter per repo and the
  number you guessed belongs to something else; `merge_pull_request` returning 500 immediately after
  a force-push to the head, because the mergeable-state recompute lags the push and a retry is the
  whole remedy; force-pushing to fix a trailer or arm auto-merge on an already-pushed branch, where
  adding a commit avoids discarding the checks already run; and the output cap applying to one large
  text result, `get_job_logs`'s `tail_lines` included, not only to lists.
- **Mechanism:** sections and bullets on this workflow skill, whose body is the element.
- **Rejected:** this cycle also re-promoted the search-overflow envelope shape, which #1886 promotes
  from another member into the same skill. Dropped here; one lesson, one bullet.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and deduplicated in an owner
  session.
- **Model:** claude-opus-5
- **Landed:** #2032
