## 2026-07-19 · born · google-identity: prose to skill-owned checks (#350)
- **Source:** missingbulb/TLDR, whose backend authenticates users with Google Sign-In ID tokens
  validated at an API Gateway JWT authorizer.
- **Reason:** a Google ID token is accepted on signature, issuer and audience, and every
  Google-issued token shares the one issuer - so a validator whose expected audience is unset
  accepts a token minted for any Google OAuth client, an authentication bypass that looks entirely
  valid. Judged on repo state on purpose: an unset audience already merged is a live bypass and must
  keep firing until it is fixed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a blocking check of the skill, gated to config-format files that use the word
  issuer and carry the bare Google accounts origin - a path form is a client-side OAuth URL rather
  than an issuer - since a skill's check runs on every repo.
- **Landed:** #350 (Refs #303) · pack version 1.

## 2026-08-14 · severity-changed · the gate moves to shared file classes and structural self-exclusion (#839)
- **Source:** the review of the declarative-check vocabulary and its messages (#838).
- **Reason:** every declaration spelled its own file set and its own escape from the skill's
  fixtures; named file sets and a structural self-exclusion of a skill's own content say it once and
  cannot drift. The failure message was rewritten to the review's word cap in the same pass.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the declaration's scope keys, with the hand-written exclusion of the skill's own
  directory dropped in favour of the engine's structural one.
- **Landed:** #839 (Refs #838) · pack version 2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
