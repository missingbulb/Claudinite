## 2026-08-08 · born · Add the jwt pack, distilled from The JWT Handbook (#705)
- **Source:** The JWT Handbook (Sebastián E. Peyrott, Auth0, v0.14.2): chapters 2-6 for
  applications and JWS/JWE/JWK structure, Annex A for the pitfalls, attacks and best current
  practices.
- **Reason:** issuing a token is a sequence of choices with no static signature, taken once and
  rarely revisited: algorithm by trust shape, key generation and storage, which claims to set, and
  sign-then-encrypt ordering. The reason `jwt-validation.md` records, applied to the minting side.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the jwt-minting skill, body workflow, reached by its description when token-issuing
  code is being added or changed.
- **Landed:** #705 (Closes #706) · pack version 1.
