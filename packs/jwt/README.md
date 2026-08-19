# jwt pack

For projects that **mint or validate JSON Web Tokens** — fingerprinted by a JWT library
(`jsonwebtoken` / `jose` / PyJWT / …) referenced in JS/TS/Python source. **Prose-free:** the pack
mounts two action skills, [`jwt-minting`](skills/jwt-minting/SKILL.md) and
[`jwt-validation`](skills/jwt-validation/SKILL.md), whose check-the-world rules run at every Stop
and in CI — each failure message is the rule. What a static sweep cannot judge (key-type/API
discipline, nested-JWT validation, JWE vs JWS guarantees) lives in the skills, read at usage time.

One scheduled task, [`jwt-advisory-watch`](tasks/jwt-advisory-watch/task.md) (monthly, assess-only):
JWT libraries have a history of critical vulnerabilities, and an advisory can publish while the
repo's own history stands still — so the watch runs on the calendar, not on repo movement, and
records its picture in a standing tracker issue.

Scope: generic JWT practice — not the Google-issuer validator's own config, and not OAuth
token acquisition in a browser client.

_Provenance: distilled from **The JWT Handbook** (Sebastián E. Peyrott, Auth0, v0.14.2) — chapters
2–6 (applications, JWS/JWE/JWK structure) and Annex A (pitfalls, attacks, best current practices)._

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `jwt-none-not-accepted` | critical | correctness | check: blocking |
| `jwt-verify-pins-algorithms` | critical | correctness | check: blocking |
| `jwt-verify-binds-audience` | high | correctness | check: advisory |
| `jwt-hardcoded-secret` | critical | correctness | check: blocking |
| `jwt-sign-sets-expiry` | high | correctness | check: advisory |
