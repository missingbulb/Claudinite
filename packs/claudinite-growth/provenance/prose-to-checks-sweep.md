## 2026-07-24 · born · Redesign Phase 2: only growth-promote stays fleet-scoped (e6620072)
- **Reason:** the standing backlog of always-testable pack prose had no owner; every other stage
  only sees what a window changed.
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** `tasks/prose-to-checks-sweep/`, loading the prose-to-checks skill.
- **Landed:** commit e6620072.

## 2026-08-30 · reworded · Local packs keep no VERSIONS.md - the commit is their record (#1442)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1442 (Closes #1439).

## 2026-08-31 · policy-changed · Scope the canon's own auto-merge policies to the folders their tasks write in (#1480)
- **Reason:** the policy stated a repo-wide kind of change where the task's bound is a place.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `automerge`, an inline folder scope intersected with the edit shape.
- **Landed:** #1480 (Closes #1479).

## 2026-09-02 · policy-changed · The weekly sweeps append to their standing PR instead of standing down (#1612)
- **Reason:** declining a round while its predecessor sat unreviewed traded a smaller review for a
  slower one; the backlog does not shrink while the round is skipped.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the `no-open-pr-titled` precondition goes, and the pinned subject becomes how a
  round finds the pull request to join.
- **Landed:** #1612 (Closes #1611).

## 2026-09-03 · reworded · A task doc opens on what the run does (#1651)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1651 (Closes #1649).

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
