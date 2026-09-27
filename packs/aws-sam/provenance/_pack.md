## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the AWS Serverless Application Model and the API-Gateway/CloudFront stack it deploys
  hit the same gotchas in every project read cold, and the context-relief architecture gave that
  body of knowledge a home active only where it applies. The pack's gotchas split between structural
  checks, where a template or package manifest carries a false-positive-free signature, and prose
  for the rest.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted on a tracked `template.yaml`/`template.yml`, so
  the pack is offered to a repo that deploys with SAM and to no other.
- **Landed:** #128 (Closes #127, Closes #131) · pack version 1.

## 2026-07-29 · policy-changed · Pack manifest as the single source: routing guidance, skills, scoped rules (#555)
- **Reason:** nothing said where a piece of content belongs, so a rule that could plausibly live in
  more than one pack defaulted into the baseline. This pack's boundary is drawn against the two
  neighbours a SAM repo actually confuses it with.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `ruleRoutingGuidance` on the manifest - `belongs` naming serverless AWS stacks,
  `excludes` pointing backend Google ID token validation at google-identity and generic Node
  packaging habits at node. The set renders as a routing table at session start, so each side is
  capped at twenty words.
- **Landed:** #555 · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carry it.
- **Actor:** @missingbulb (owner).
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `locate` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `locate` (engine/pack_loader/locate.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.
