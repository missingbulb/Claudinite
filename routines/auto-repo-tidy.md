# Repo tidy-up — retired into the `tidy-repo` pack

The standalone nightly repo tidy-up has moved into the composable
**[`tidy-repo`](../packs/tidy-repo/README.md)** pack. Declaring that pack enrolls a repo in the
PR/branch/issue sweep, run by the [fleet daily routine](auto-all-repos-maintenance.md); removing it is
a durable opt-out.

Where the content went:

- **Policy** (assess PRs/branches read-only, act only on issues) → the pack's `RULES.md`.
- **Method** (the landed-status test, the issue-action ladder) → the single-object skills
  [`single-branch-status`](../skills/single-branch-status/SKILL.md),
  [`single-pr-status`](../skills/single-pr-status/SKILL.md),
  [`single-issue-triage`](../skills/single-issue-triage/SKILL.md).
- **The standing tracker** (one issue per repo, body rewritten to today's state, a dated comment per
  run) → the pack's `tidy-report` task.

Nothing to vendor separately — declare `tidy-repo`.
