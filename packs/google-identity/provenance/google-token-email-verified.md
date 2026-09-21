## 2026-07-19 · born · google-identity: prose to skill-owned checks (#350)
- **Source:** missingbulb/TLDR, whose backend authenticates users with Google Sign-In ID tokens
  validated at an API Gateway JWT authorizer.
- **Reason:** a Google ID token carries `email` whether or not Google verified it, so an action
  gated on the bare claim trusts an unverified address; and behind an API Gateway authorizer the
  claim arrives as a string, so a strict boolean comparison silently rejects every genuinely
  verified user.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a blocking check of the skill, gated per file on a verified-claims context and per
  repo on a Google-identity marker, test files excluded.
- **Landed:** #350 (Refs #303) · pack version 1.

## 2026-08-14 · severity-changed · the gate moves to shared file classes and structural self-exclusion (#839)
- **Source:** the review of the declarative-check vocabulary and its messages (#838).
- **Reason:** the same review: the hand-spelled source-file and test-file regexes become the shared
  `javascriptFiles`, `pythonFiles` and `testFiles` sets, and the skill's own content is excluded
  structurally. The failure message was rewritten to the review's word cap in the same pass.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the declaration's scope keys.
- **Landed:** #839 (Refs #838) · pack version 2.
