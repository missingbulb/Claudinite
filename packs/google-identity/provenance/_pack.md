## 2026-07-19 · born · google-identity: prose to skill-owned checks (#350)
- **Source:** missingbulb/TLDR, whose backend authenticates users with Google Sign-In ID tokens
  validated at an API Gateway JWT authorizer.
- **Reason:** the extension-client half of Google auth was already homed in the chrome-extension
  pack, and the server side - the validator that accepts the token - was unhomed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, declared by hand with no fingerprint: the technology shows up as
  the Google accounts OIDC issuer inside a JWT-authorizer or verifier config, which has no canonical
  filename and co-occurs with other stacks, so an absent `detect` skips the drift check in both
  directions and declaring the pack is authoritative.
- **Landed:** #350 (Refs #303) · pack version 1.

## 2026-08-19 · reworded · the pack's prose stops naming its neighbours (#1060)
- **Reason:** boundary and turf prose is a second copy of what `ruleRoutingGuidance.excludes`
  already carries in one machine-read field, the field a lesson is routed by; the README now states
  what the pack does not cover without naming who does.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1060 (Closes #1057) · pack version 3.

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

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · moved · the manifest becomes pack.json
- **Reason:** a manifest that is data is read with no import and by any tool; the conversion wrote
  the module's evaluated export, and the pack loads identically.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** pack.json, which the loader prefers over pack.mjs; a canon pack now needs engine
  60928.1, the first to read it.
