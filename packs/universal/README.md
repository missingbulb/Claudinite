# universal pack

Always on — the baseline every session loads (`RULES.md`, injected by the pack-prose hook) plus the checks that run for every project.

## Checks (hardcoded)

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `reference-integrity` | links resolve; no deleted-path references | blocking |
| `markdown-link-labels` | link label matches its target | blocking |
| `task-lifecycle` | branch commits reference an issue | blocking |
| `warning-suppression` | no new suppression markers | blocking |
| `pack-declaration` | declaration matches repo fingerprint | blocking |
| `squash-merge-history` | main has no merge commits | blocking |
| `file-placement` | code references stay near | advisory |
| `claude-md-length` | root CLAUDE.md under ~200 lines | advisory |
| `generated-merge-driver` | GENERATED files get merge=ours | advisory |

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Start from the problem, not solution | prose |
| Confirm behavior isn't already provided | prose |
| A misread ≠ a wrong artifact | prose |
| Clean-room rebuild from the source | prose |
| Fix warnings, never tolerate them | prose |
| Never quick-path a warning suppression | prose + check (`warning-suppression`) |
| An approval applies only backward | prose |
| Task lifecycle: issue → branch → PR | prose + check (`task-lifecycle`) |
