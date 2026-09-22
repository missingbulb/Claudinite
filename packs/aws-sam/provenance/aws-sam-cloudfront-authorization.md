## 2026-07-06 · born · aws-sam: two YAML-based checks (handler-path, cloudfront-authorization) via a minimal YAML parser (#137)
- **Reason:** AWS rejects the policy at deploy, so the rule's whole cost is a failed deploy, and the
  template carries the signature.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check aws-sam/cloudfront-authorization, blocking, reading the template through the
  minimal YAML parser and scoped to the `AWS::CloudFront::OriginRequestPolicy` resource's own
  headers, so `Authorization` named elsewhere - an API Gateway authorizer's `IdentitySource` - is
  not flagged.
- **Rejected:** a text-grep conversion - the first prose-to-checks pass (#131) rejected this gotcha
  as false-positive-prone for the same reason as handler-path.
- **Landed:** #137 (Closes #136) · pack version 1.

## 2026-08-14 · moved · Pattern-check engine: structured-data (parsed JSON/YAML) assertions (#820)
- **Reason:** a check whose subject is a parsed document's fields is data, not code; the declaration
  states it with ids, severities and message strings preserved verbatim.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the hand-written `run(ctx)` becomes a `forEachParsedEntry` declaration over the
  template's `Resources`, filtered by resource type.
- **Landed:** #820 (Closes #819) · pack version 2.

## 2026-08-14 · moved · Declared checks are JSON, one file per pack (#827)
- **Reason:** a declaration is a table row, not a module. JSON cannot hold a comment, so the
  no-comments-on-a-check rule is enforced by construction, and a declared check states its own case
  rather than deferring to a `doc` pointer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the declaration moves into `packs/aws-sam/declared-checks.json`, discovered
  structurally by the pack registry - no import and no manifest line, so writing the declaration
  adds the check.
- **Landed:** #827 (Closes #826) · pack version 2.
