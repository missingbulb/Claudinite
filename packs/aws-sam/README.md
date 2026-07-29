# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| esbuild strips the entry subdirectory | prose + check (`aws-sam/handler-path`) |
| esbuild must be a dependency | prose + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization custom-policy | prose + check (`aws-sam/cloudfront-authorization`) |

All three SAM gotchas are enforced (the last two via the minimal YAML parser in `engine/checks/helpers/`); the pack's runtime-only gotchas would stay prose.
