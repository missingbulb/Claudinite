## 2026-08-08 · born · Add the jwt pack, distilled from The JWT Handbook (#705)
- **Source:** The JWT Handbook (Sebastián E. Peyrott, Auth0, v0.14.2): chapters 2-6 for
  applications and JWS/JWE/JWK structure, Annex A for the pitfalls, attacks and best current
  practices.
- **Reason:** what a static sweep cannot judge is the half that needs a reader: key-type and API
  discipline, exact-match claim validation, nested-JWT layer order, and what JWE does and does not
  vouch for. Carried as a skill so a project that never touches JWTs pays nothing for it, and a
  session wiring verification gets all of it at once.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the jwt-validation skill, body guidelines, reached by its description when
  verification code is being added or changed. Its seven guidelines carry this reason and cite it
  from here.
- **Landed:** #705 (Closes #706) · pack version 1.
