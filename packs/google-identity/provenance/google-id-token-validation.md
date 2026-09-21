## 2026-07-19 · born · google-identity: prose to skill-owned checks (#350)
- **Source:** missingbulb/TLDR, whose backend authenticates users with Google Sign-In ID tokens
  validated at an API Gateway JWT authorizer.
- **Reason:** the pack opened with three prose rules judged to have no reliable check signature. The
  owner's direction reversed that in the same pull request: there is no universal signature, but
  file-scoped ones cover every grounded case, so the rules became checks, the prose was deleted and
  the pack kept only as the hand-declared anchor. The signature-less residue - a hand-rolled
  verifier in code - is documented as out of the checks' scope.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the skill, mounted by the pack and reached by its description, carrying the
  activity and nothing about its own enforcement: the checks run on their own at every Stop and in
  CI and each failure message carries its rule, so a skill listing their ids would duplicate the
  mechanism and drift from it.
- **Landed:** #350 (Refs #303) · pack version 1.

## 2026-08-19 · reworded · the skill stops naming the neighbouring pack (#1060)
- **Reason:** the same sweep: the skill's scope line pointed the reader at another pack for
  client-side token acquisition; it now says only that acquiring the token client-side is out of
  scope.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1060 (Closes #1057) · pack version 3.
