# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The deploy role drives transform and CloudFront | high | correctness | prose: 79 words |
| A new account waits for CloudFront verification | medium | correctness | prose: 58 words |
| Clean up a failed first CREATE | high | correctness | prose: 54 words |
| Review the change set for Replacement | critical | correctness | prose: 55 words |
| A custom header preflights any GET | medium | correctness | prose: 60 words |
| Reach AWS by CLI or boto3 | low | complexity | prose: 96 words |

The template-shape gotchas (CloudFront `Authorization` forwarding, the CDN hit that skips the
authorizer, TTL over invalidation, non-`http` CORS origins, GSI backfill) are the
[`sam-template`](skills/sam-template/SKILL.md) skill, forced for `**/template.yaml` and
`**/template.yml`, and the build dependencies (esbuild as a regular dependency, bundling the SDK) are
[`sam-build-and-deps`](skills/sam-build-and-deps/SKILL.md), forced for `package.json` and the
template. The `esbuild-dependency` and `cloudfront-authorization` checks below carry their rules'
mechanical halves regardless.

## Skills

| Skill | Trigger |
|---|---|
| [`sam-template`](skills/sam-template/SKILL.md) | any edit of `template.yaml` / `template.yml` — held by the guard until loaded |
| [`sam-build-and-deps`](skills/sam-build-and-deps/SKILL.md) | any edit of `package.json` or the template — held by the guard until loaded |

## Checks

Each SAM gotcha with a false-positive-free signature in the template or the package manifest (the last two read it through the minimal YAML parser in `engine/checks/helpers/`).

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `aws-sam/handler-path` | high | correctness | check: blocking |
| `aws-sam/esbuild-dependency` | high | correctness | check: blocking |
| `aws-sam/cloudfront-authorization` | critical | correctness | check: blocking |
