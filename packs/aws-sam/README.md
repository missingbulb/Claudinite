# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Checks (hardcoded)

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `aws-sam/esbuild-dependency` | esbuild is a regular dependency | blocking |
| `aws-sam/handler-path` | Handler drops the entry subdirectory | blocking |
| `aws-sam/cloudfront-authorization` | policy doesn't list Authorization header | blocking |

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| esbuild strips the entry subdirectory | prose + check (`aws-sam/handler-path`) |
| esbuild must be a dependency | prose + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization custom-policy | prose + check (`aws-sam/cloudfront-authorization`) |

All three SAM gotchas are now enforced (the last two via the minimal YAML parser in `engine/checks_helpers/`); the pack's runtime-only gotchas would stay prose.
