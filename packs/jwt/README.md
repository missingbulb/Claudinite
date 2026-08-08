# jwt pack

For projects that **mint or validate JSON Web Tokens** — fingerprinted by a JWT library
(`jsonwebtoken` / `jose` / PyJWT / …) referenced in JS/TS/Python source. **Prose-free:** the pack
mounts two action skills, [`jwt-minting`](skills/jwt-minting/SKILL.md) and
[`jwt-validation`](skills/jwt-validation/SKILL.md), whose check-the-world rules run at every Stop
and in CI — each failure message is the rule. What a static sweep cannot judge (key-type/API
discipline, nested-JWT validation, JWE vs JWS guarantees) lives in the skills, read at usage time.

| Rule (≤5 words) | How enforced |
|---|---|
| Never accept alg none | skill check `jwt-none-not-accepted` |
| Pin verification algorithms | skill check `jwt-verify-pins-algorithms` |
| Bind audience/issuer at verify | skill check `jwt-verify-binds-audience` (advisory) |
| No secrets in source | skill check `jwt-hardcoded-secret` |
| Minted tokens expire | skill check `jwt-sign-sets-expiry` (advisory) |

One scheduled task, [`jwt-advisory-watch`](tasks/jwt-advisory-watch/task.md) (monthly, assess-only):
JWT libraries have a history of critical vulnerabilities, and an advisory can publish while the
repo's own history stands still — so the watch runs on the calendar, not on repo movement, and
records its picture in a standing tracker issue.

Scope: generic JWT practice. The Google-issuer validator config is the
[`google-identity`](../google-identity/README.md) pack's turf; OAuth token acquisition in browser
clients is [`chrome-extension`](../chrome-extension/README.md)'s.

_Provenance: distilled from **The JWT Handbook** (Sebastián E. Peyrott, Auth0, v0.14.2) — chapters
2–6 (applications, JWS/JWE/JWK structure) and Annex A (pitfalls, attacks, best current practices)._
