## 2026-09-18 · born · converted from references.md (RULES-7)
- **Reason:** The stamp is a generated copy of `package.json`'s version, and a copy that drifts
  names a build that was never served while the page looks perfectly normal. The rule and the scheme
  arrived here from cloudflare-site when versioning stopped being a hosting pack's business (owner,
  2026-09-17: a hosting pack "needs to only care itself with how to serve, wire release, maintain a
  release … not anything else that deals 'being a website' like versions").
- **Mechanism:** prose
- **Retire when:** Retire the rule if the version stops being copied into the pages.
