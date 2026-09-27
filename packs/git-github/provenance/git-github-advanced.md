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

## 2026-09-25 · trigger-changed · "the baseline lifecycle" reads "the basics task lifecycle"
- **Reason:** owner decision retiring the baseline vocabulary; the pack every repo declares is
  basics.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the skill description, triggering on what it did before.

## 2026-09-26 · born · requesting review from a PR's own author always fails (#906)
- **Source:** EdFringeNow's local pack, read by the `growth-promote` task's 2026-09-26 window: an
  identical `update_pull_request`/`create_pull_request` call naming the repo's own account in
  `reviewers` recurred across six independent sessions there, each hitting GitHub's own "Review
  cannot be requested from pull request author" rejection.
- **Reason:** a 100%-predictable, zero-value call any future session can skip entirely by checking
  the PR's actual author first — general enough to state once here rather than leaving every
  single-owner repo to rediscover it and (optionally) hard-code its own account into a local guard.
- **Mechanism:** a section on this workflow skill, whose body is the element.
- **Actor:** claudinite-canon-curation growth-promote run.
- **Model:** claude-sonnet-5
- **Landed:** #2333

## 2026-09-27 · reworded · Claudinite canon: rule revalidation
- **Reason:** re-probed 2026-09-27 against run 36313686047 while its only job was `in_progress`:
  `get_job_logs(run_id, failed_only: true)` answered `failed_jobs: 0` / "No failed jobs found in
  this workflow run", so zero failures read a running job as green; and the same tool on that job's
  id returned a `logs_url` and "Job logs are available for download", the `HTTP 404` surfacing only
  under `return_content: true`. Both were the section's stated way to confirm a non-PR run.
- **Actor:** the canon-rule-revalidation task, running as work item #2349.
- **Model:** claude-opus-5
- **Retire when:** `get_job_logs` distinguishes an unfinished run from a green one.

## 2026-09-27 · strengthened · a stale ref needs a fetch, not always `--unshallow`
- **Source:** Shepherd's local pack, read by the `growth-promote` task's 2026-09-27 window: a
  member session had, at one point, treated any stale-looking `origin/main` in a shallow checkout
  as needing `--unshallow`, until a later live re-probe found a plain `git fetch origin main`
  updated a six-day-stale ref correctly with no `--unshallow` at all.
- **Reason:** the existing bullet's `--unshallow` remedy is for a *history* gap (`merge-base`
  failing on branches predating the shallow point) and does not license unshallowing on a *stale
  ref* alone, which a plain fetch already fixes at a fraction of the cost.
- **Mechanism:** a sentence appended to the existing shallow-checkout section, whose body is the
  element.
- **Actor:** claudinite-canon-curation growth-promote run.
- **Model:** claude-sonnet-5
- **Landed:** https://github.com/missingbulb/Claudinite/pull/2283
