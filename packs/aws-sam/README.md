# aws-sam pack

Active when the repo has a SAM `template.yaml`/`.yml`.

## Rules (`RULES.md`)

The three always-on rules — the ones a session needs whether or not it opens the template or
runs a deploy:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Review the change set for Replacement | critical | correctness | prose: 55 words |
| A custom header preflights any GET | medium | correctness | prose: 60 words |
| Reach AWS by CLI or boto3 | low | complexity | prose: 96 words |

The template-shape gotchas (CloudFront `Authorization` forwarding, the CDN hit that skips the
authorizer, TTL over invalidation, non-`http` CORS origins, GSI backfill) are the
[`sam-template`](skills/sam-template/SKILL.md) skill, forced for `**/template.yaml` and
`**/template.yml`; the deploy-time failures (deploy-role grants, the new-account CloudFront gate, a
failed first `CREATE`) are [`sam-deploy`](skills/sam-deploy/SKILL.md), loaded by activity; and the
build dependencies (esbuild as a regular dependency, bundling the SDK) are
[`sam-build-and-deps`](skills/sam-build-and-deps/SKILL.md), forced for `package.json` and the
template. The `esbuild-dependency` and `cloudfront-authorization` checks below carry their rules'
mechanical halves regardless.

## Checks

Each SAM gotcha with a false-positive-free signature in the template or the package manifest (the last two read it through the minimal YAML parser in `engine/checks/helpers/`).

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `aws-sam/handler-path` | high | correctness | check: blocking |
| `aws-sam/esbuild-dependency` | high | correctness | check: blocking |
| `aws-sam/cloudfront-authorization` | critical | correctness | check: blocking |

## Skills

| Skill | Trigger |
|---|---|
| [`sam-template`](skills/sam-template/SKILL.md) | any edit of `template.yaml`/`template.yml` — held by the guard until loaded |
| [`sam-deploy`](skills/sam-deploy/SKILL.md) | running or debugging `sam deploy`, or setting up a deploy principal |
| [`sam-build-and-deps`](skills/sam-build-and-deps/SKILL.md) | any edit of `package.json` or the template — held by the guard until loaded |
