## 2026-09-05 · born · converted from references.md (sam-template-2)
- **Reason:** Cache key and origin forwarding are independent controls — a `CachePolicy` defines
  the cache key, an `OriginRequestPolicy` defines what reaches the origin — which is why the two
  are set separately to cache public GETs on one entry while still delivering `Authorization` for
  authenticated writes. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as
  “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it).
- **Mechanism:** prose, a guideline of the sam-template skill
- **Retire when:** Reaffirm against CloudFront's managed-policy list; retire if a custom policy is
  ever allowed to name `Authorization`.
