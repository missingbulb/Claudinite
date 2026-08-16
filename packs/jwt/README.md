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

Scope: generic JWT practice. The Google-issuer validator config is the
[`google-identity`](../google-identity/README.md) pack's turf; OAuth token acquisition in browser
clients is [`chrome-extension`](../chrome-extension/README.md)'s.

_Provenance: distilled from **The JWT Handbook** (Sebastián E. Peyrott, Auth0, v0.14.2) — chapters
2–6 (applications, JWS/JWE/JWK structure) and Annex A (pitfalls, attacks, best current practices)._

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `jwt-none-not-accepted` | blocking | critical | correctness | a verifier never accepts `alg: none` — an unsigned token's claims are attacker-written |
| `jwt-verify-pins-algorithms` | blocking | critical | correctness | verification pins its algorithm allowlist rather than reading the attacker-written header |
| `jwt-verify-binds-audience` | advisory | high | correctness | verification binds audience and issuer, so a token minted for another service does not pass |
| `jwt-hardcoded-secret` | blocking | critical | correctness | no signing secret in source — it ships with every clone and grants full minting power forever |
| `jwt-sign-sets-expiry` | advisory | high | correctness | a minted token carries `exp`: stateless validation has no revocation, so a leak is otherwise permanent |
