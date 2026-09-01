# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| esbuild is a regular dependency | high | correctness | prose: 51 words + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization | critical | correctness | prose: 82 words + check (`aws-sam/cloudfront-authorization`) |
| The deploy role drives transform and CloudFront | high | correctness | prose: 79 words |
| A new account waits for CloudFront verification | medium | correctness | prose: 58 words |
| Clean up a failed first CREATE | high | correctness | prose: 54 words |
| HTTP API rejects a chrome-extension:// origin | high | correctness | prose: 51 words |
| A CDN hit skips the authorizer | critical | correctness | prose: 62 words |
| Short TTL beats cache invalidation | medium | performance | prose: 48 words |
| Bundle the AWS SDK into the artifact | high | correctness | prose: 59 words |
| Review the change set for Replacement | critical | correctness | prose: 55 words |
| A new GSI doesn't backfill items | high | correctness | prose: 51 words |
| A custom header preflights any GET | medium | correctness | prose: 60 words |
| Reach AWS by CLI or boto3 | low | complexity | prose: 96 words |

## Checks

Each SAM gotcha with a false-positive-free signature in the template or the package manifest (the last two read it through the minimal YAML parser in `engine/checks/helpers/`).

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `aws-sam/handler-path` | high | correctness | check: blocking |
| `aws-sam/esbuild-dependency` | high | correctness | check: blocking |
| `aws-sam/cloudfront-authorization` | critical | correctness | check: blocking |
