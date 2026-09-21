## 2026-08-08 · born · Add the jwt pack, distilled from The JWT Handbook (#705)
- **Source:** The JWT Handbook (Sebastián E. Peyrott, Auth0, v0.14.2): chapters 2-6 for
  applications and JWS/JWE/JWK structure, Annex A for the pitfalls, attacks and best current
  practices.
- **Reason:** token budget was the design constraint, so the pack injects no session-start prose at
  all and the book's teaching lands in deterministic-first layers instead: five checks whose failure
  message is the rule, and two action skills read only at usage time for what a static sweep cannot
  judge. Scoped to generic JWT practice, leaving the Google-issuer validator's own config and
  browser-client OAuth token acquisition to the packs that own them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a JWT library reference (`jsonwebtoken`,
  `jose`, PyJWT and their kin) in JS/TS/Python source. The marker only suspects the pack; declaring
  it stays the project's call.
- **Rejected:** a migration record to carry members across the three new blocking checks. The pack
  is opt-in, a fingerprint only suspects and baselining never auto-declares, so no existing member
  could turn red; a rehearsal fixture proving a member that does opt in converges green was the
  additive answer, negative-probed by hand against a hardcoded secret and an unpinned verify.
- **Landed:** #705 (Closes #706) · pack version 1.

## 2026-09-01 · moved · the pack's advisory watch becomes canon curation's upstream-watch (#1569)
- **Reason:** a pack's `tasks/` are work every member repo runs, so the monthly `jwt-advisory-watch`
  charged the fleet for a duty that is the canon's, and made it unrepeatable: one bespoke watcher
  per pack that wanted one. Deliberately dropped with it: scanning a member's own lockfiles for JWT
  libraries inside an advisory's affected range, which is dependency-update tooling rather than pack
  content, and nothing replaces it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the README's `## Upstream` section, one line per source naming what to watch, where
  it publishes and the state this pack's content was last reconciled against; presence of the
  section is the whole opt-in, and the canon's own monthly task reads it. The pack now declares
  three sources: RFC 8725, the GitHub Advisory Database's JWT libraries for the classes of flaw the
  skills teach against, and the Handbook itself.
- **Landed:** #1569 (Closes #1568) · pack version 60901.1.
