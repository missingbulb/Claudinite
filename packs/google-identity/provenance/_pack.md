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
