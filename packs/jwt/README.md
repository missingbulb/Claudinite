# jwt pack

For projects that **mint or validate JSON Web Tokens** — fingerprinted by a JWT library
(`jsonwebtoken` / `jose` / PyJWT / …) referenced in JS/TS/Python source. **Prose-free:** the pack
mounts two action skills, [`jwt-minting`](skills/jwt-minting/SKILL.md) and
[`jwt-validation`](skills/jwt-validation/SKILL.md), whose check-the-world rules run at every Stop
and in CI — each failure message is the rule. What a static sweep cannot judge (key-type/API
discipline, nested-JWT validation, JWE vs JWS guarantees) lives in the skills, read at usage time.

Scope: generic JWT practice — not the Google-issuer validator's own config, and not OAuth
token acquisition in a browser client.

_Provenance: distilled from **The JWT Handbook** (Sebastián E. Peyrott, Auth0) — chapters
2–6 (applications, JWS/JWE/JWK structure) and Annex A (pitfalls, attacks, best current practices)._

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `jwt-none-not-accepted` | critical | correctness | check: blocking |
| `jwt-verify-pins-algorithms` | critical | correctness | check: blocking |
| `jwt-verify-binds-audience` | high | correctness | check: advisory |
| `jwt-hardcoded-secret` | critical | correctness | check: blocking |
| `jwt-sign-sets-expiry` | high | correctness | check: advisory |

## Upstream

Where JWT practice publishes the changes that can date this pack's guidance, and the state the
content has been reconciled against. The canon's `upstream-watch` reads this section; a member
repo reads nothing here.

- **RFC 8725 — JWT Best Current Practices** — https://www.rfc-editor.org/rfc/rfc8725
  — reconciled through RFC 8725 (BCP 225), February 2020
- **GitHub Advisory Database, JWT libraries** — https://github.com/advisories?query=type%3Areviewed+jwt
  — reconciled through 2026-09-01, for the *classes* of flaw the skills teach against (algorithm
  confusion, unverified signatures, key confusion), never a member's own resolved versions
- **The JWT Handbook**, this pack's provenance above — https://auth0.com/resources/ebooks/jwt-handbook
  — reconciled through v0.14.2 (chapters 2–6 and Annex A)
