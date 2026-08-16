# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| esbuild must be a regular dependency, not a devDependency. | 50 | high | correctness | prose + check (`aws-sam/esbuild-dependency`) |
| CloudFront won't forward Authorization via a custom origin-request policy | 81 | critical | correctness | prose + check (`aws-sam/cloudfront-authorization`) |
| A deploy role must be able to drive the transform and CloudFront, or change-set creation fails with the real reason hidden. | 79 | high | correctness | prose |
| A brand-new AWS account can't create a CloudFront distribution until AWS verifies it. | 58 | medium | correctness | prose |
| A failed first CREATE must be cleaned up before you retry. | 54 | high | correctness | prose |
| API Gateway HTTP API (v2) rejects a chrome-extension:// origin in CORS AllowOrigins | 51 | high | correctness | prose |
| A CDN cache hit is served before the request reaches the origin or its authorizer | 62 | critical | correctness | prose |
| Prefer a short CloudFront TTL over per-write cache invalidation. | 48 | medium | performance | prose |
| Bundle the AWS SDK into the Lambda artifact rather than relying on the managed runtime's copy. | 59 | high | correctness | prose |
| Review the change set before applying — Replacement: True on a stateful resource is a data-loss hard stop. | 55 | critical | correctness | prose |
| Adding a DynamoDB GSI does not backfill existing items. | 51 | high | correctness | prose |
| A custom request header turns even a public GET into a preflighted CORS request. | 60 | medium | correctness | prose |
| Reach AWS from a session with the AWS CLI or a boto3 script — there is no AWS MCP tool. | 96 | low | complexity | prose |

## Checks

Each SAM gotcha with a false-positive-free signature in the template or the package manifest (the last two read it through the minimal YAML parser in `engine/checks/helpers/`).

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `aws-sam/handler-path` | blocking | high | correctness | the handler path matches what esbuild emits — esbuild strips the entry's subdirectory, so a nested entry's handler resolves to a file the bundle does not contain |
| `aws-sam/esbuild-dependency` | blocking | high | correctness | esbuild is a regular dependency: SAM's builder runs a production-only npm install, so a devDependency copy is skipped and the build fails |
| `aws-sam/cloudfront-authorization` | blocking | critical | correctness | no custom origin-request policy forwards Authorization — CloudFront rejects it at deploy time |
