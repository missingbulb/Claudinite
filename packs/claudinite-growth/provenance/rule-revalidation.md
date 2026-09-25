## 2026-08-17 · born · Weekly rule-revalidation: re-probe the claims whose truth lives outside the repo (#933)
- **Reason:** capture, dedup and conversion all assume a rule is either right or superseded. The
  third failure mode - the rule was right and the world moved - has no local signal at all, so
  nothing goes red and sessions keep obeying a route that closed.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a weekly task whose trigger is the calendar, because no repo-side signal sees a
  platform move; the method is re-running the probe rather than re-reading the prose.
- **Retire when:** the packs stop carrying claims about anything outside the repository.
- **Landed:** #933.

## 2026-08-30 · reworded · Local packs keep no VERSIONS.md - the commit is their record (#1442)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1442 (Closes #1439).

## 2026-09-01 · reworded · writing-pack-prose: the pack-prose authoring skill and the per-pack references doc (#1561)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1561 (Closes #1560).

## 2026-09-02 · policy-changed · The weekly sweeps append to their standing PR instead of standing down (#1612)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the `no-open-pr-titled` precondition goes, and the run appends to the standing pull
  request's body rather than replacing it - a reviewer cannot re-derive a probe result.
- **Landed:** #1612 (Closes #1611).

## 2026-09-03 · reworded · A task doc opens on what the run does (#1651)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1651 (Closes #1649).

## 2026-09-07 · policy-changed · rule-revalidation lands its own local-pack corrections, canon stays reviewed (#1844)
- **Reason:** the run corrects a check and its fixture and deletes a dead rule, both inside the
  local packs and both outside the Markdown-only class it named.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `automerge`, the inline folder scope over the repo's own local packs.
- **Landed:** #1844 (Closes #1843).

## 2026-09-13 · policy-changed · Drop pr_name; keep the rule, and simplify the growth policies (#1951)
- **Actor:** @missingbulb (owner).
- **Mechanism:** `automerge`, one folder scope with no diff-class intersection.
- **Landed:** #1951 (Closes #1977, Closes #1978).

## 2026-09-15 · scope-changed · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the corpus is the repo's own local packs; the shelf is canon-curation's twin task,
  loading the same skill.
- **Landed:** #2047 (Closes #2044).

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
