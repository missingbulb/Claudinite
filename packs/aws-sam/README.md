# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| esbuild must be a regular dependency, not a devDependency. | high | correctness | prose: 50 words + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization via a custom origin-request policy | critical | correctness | prose: 81 words + check (`aws-sam/cloudfront-authorization`) |
| A deploy role must be able to drive the transform and CloudFront, or change-set creation fails with the real reason hidden. | high | correctness | prose: 79 words |
| A brand-new AWS account can't create a CloudFront distribution until AWS verifies it. | medium | correctness | prose: 58 words |
| A failed first CREATE must be cleaned up before you retry. | high | correctness | prose: 54 words |
| API Gateway HTTP API (v2) rejects a chrome-extension:// origin in CORS AllowOrigins | high | correctness | prose: 51 words |
| A CDN cache hit is served before the request reaches the origin or its authorizer | critical | correctness | prose: 62 words |
| Prefer a short CloudFront TTL over per-write cache invalidation. | medium | performance | prose: 48 words |
| Bundle the AWS SDK into the Lambda artifact rather than relying on the managed runtime's copy. | high | correctness | prose: 59 words |
| Review the change set before applying — Replacement: True on a stateful resource is a data-loss hard stop. | critical | correctness | prose: 55 words |
| Adding a DynamoDB GSI does not backfill existing items. | high | correctness | prose: 51 words |
| A custom request header turns even a public GET into a preflighted CORS request. | medium | correctness | prose: 60 words |
| Reach AWS from a session with the AWS CLI or a boto3 script — there is no AWS MCP tool. | low | complexity | prose: 96 words |

## Checks

Each SAM gotcha with a false-positive-free signature in the template or the package manifest (the last two read it through the minimal YAML parser in `engine/checks/helpers/`).

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `aws-sam/handler-path` | high | correctness | check: blocking |
| `aws-sam/esbuild-dependency` | high | correctness | check: blocking |
| `aws-sam/cloudfront-authorization` | critical | correctness | check: blocking |
