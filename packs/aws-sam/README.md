# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Checks (hardcoded)

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `aws-sam/esbuild-dependency` | esbuild is a regular dependency | blocking |

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| esbuild strips the entry subdirectory | prose |
| esbuild must be a dependency | prose + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization custom-policy | prose |
