# github-actions pack

Active when the repo has `.github/workflows/*.yml` — the workflow-YAML and Actions-runner platform
behaviours a repo cannot get wrong. **Prose-free**: every rule here has a signature in the workflow
YAML itself, so each rides a check whose failure message *is* the rule. The scheduling behaviour that
is judgment rather than shape — what a `schedule:` trigger actually guarantees — lives in the
[`github-actions-scheduling`](skills/github-actions-scheduling/SKILL.md) skill.

Sibling packs on the same axis: `git-github` (git and GitHub command procedure), and each product's
own `-release` pack (the content of one release pipeline, not the platform under it).

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `gha/secrets-in-job-if` | blocking | high | correctness | no job-level `if:` reads a secret — the condition cannot evaluate there, so the job fails instead of skipping |
| `gha/run-pipefail` | blocking | high | correctness | a piped `run:` sets `pipefail` — the implicit shell is `bash -e` without it, so a failing pipe still shows green |
| `gha/checkout-submodules` | blocking | high | correctness | a gate that reads submodule content checks them out — `checkout` does not fetch submodules, so the gate passes vacuously |
| `gha/pages-artifact-symlinks` | blocking | high | correctness | no dangling symlink reaches `upload-pages-artifact`, which tars with `--dereference` and fails the whole deploy |
| `gha/no-scheduled-fleet-executor` | blocking | medium | correctness | one cron per repo: a second schedule competes with the per-repo scheduler that owns every recurring Claudinite job |
| `gha/scheduled-failure-escalation` | advisory | high | correctness | a scheduled workflow escalates its own failure — nobody watches the Actions list, so a red run otherwise reaches no one |
| `gha/label-create-before-add` | advisory | medium | correctness | a label is created before it is added; GitHub will not create one on demand |
| `gha/unique-automation-branch` | advisory | medium | correctness | an automation branch name is unique per run, so a repeat run for the same key does not collide with itself |
