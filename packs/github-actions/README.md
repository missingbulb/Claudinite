# github-actions pack

Active when the repo has `.github/workflows/`. Workflow lints plus one bundled skill — no `RULES.md` prose.

## Skills

| Skill | Covers |
|---|---|
| [`github-actions-scheduling`](skills/github-actions-scheduling/SKILL.md) | what a `schedule:` trigger actually guarantees (late/dropped fires, the 60-day disable) and how to build and describe cron'd work around it |

## Checks (hardcoded)

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `gha/secrets-in-job-if` | no secrets in job-level if | blocking |
| `gha/run-pipefail` | piped run steps set pipefail | blocking |
| `gha/checkout-submodules` | checkout fetches submodules when present | blocking |
| `gha/scheduled-failure-escalation` | scheduled workflow escalates its failure | advisory |
| `gha/label-create-before-add` | create a label before adding | advisory |
| `gha/unique-automation-branch` | automated branch names are unique | advisory |
| `gha/pages-artifact-symlinks` | Pages upload prunes tooling symlinks | blocking |
| `gha/no-scheduled-fleet-executor` | Claudinite executor stays dispatch-only | blocking |
