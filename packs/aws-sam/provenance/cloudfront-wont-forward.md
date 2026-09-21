## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a custom `AWS::CloudFront::OriginRequestPolicy` listing `Authorization` is rejected at
  deploy. Cache key and origin forwarding are independent controls - a `CachePolicy` defines the
  cache key, an `OriginRequestPolicy` defines what reaches the origin - which is why the two are set
  separately to cache public GETs on one entry while still delivering `Authorization` for
  authenticated writes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Retire when:** reaffirm against CloudFront's managed-policy list; retire if a custom policy is
  ever allowed to name `Authorization`.
- **Landed:** #128 (Closes #127, Closes #131) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the sweep cut from every rule in the corpus the consequence prose arguing for a rule
  rather than enabling it, leaving each as trigger, instruction, and at most one clause of why. This
  pack went from 984 words to 885.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-07-29 · reaffirmed · prose-to-checks: add the deletion test and sweep the canon with it (#552)
- **Reason:** kept against the deletion test: the bullet carries a second rule the check does not,
  why the plain `AllViewer` variant is wrong, since forwarding the viewer `Host` to an API Gateway
  origin returns 403.
- **Actor:** @missingbulb (owner).
- **Landed:** #552 (Closes #551) · pack version 1.

## 2026-09-01 · reaffirmed · Recover the rationale #467 cut from the shared packs into references.md (#1575)
- **Reason:** #467 cut these clauses as consequence prose before the pack had anywhere to keep them.
  Recovering them does not undo that decision - every rule line stays exactly as #467 left it, and
  only clauses carrying a failure mode, cost, frequency or authority, something a review can weigh,
  were taken back.
- **Actor:** @missingbulb (owner).
- **Landed:** #1575 (Closes #1571) · pack version 60901.2.

## 2026-09-05 · moved · Rules to skills: the audit's path-forced extractions (#1667)
- **Reason:** a rule leaves RULES.md for a skill only where that skill's
  `force-load-on-file-edits-paths` covers every moment the rule is needed; a skill the model would
  have to pick by description alone is not predictable. These rules are all predicted by an edit of
  the template or the package manifest, so they move, while the deploy-time failures, which no file
  edit predicts, stay in the prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** from RULES.md into the sam-template skill, forced for `**/template.yaml` and
  `**/template.yml`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
