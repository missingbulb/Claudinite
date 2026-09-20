## 2026-09-18 · born · converted from references.md (RULES-3)
- **Reason:** There is no server here to vary `Cache-Control` per file, so the freshness policy
  moves into the client. A per-file TTL reprices the same bet on every file and gets it wrong in
  both directions at once: too long and visitors read stale data, too short and they re-download
  what never changed. A content manifest buys longer caching **and** fresher data, which no TTL can
  offer together, and the extra request is usually one the page already makes for a version string.
  Expect a mismatch mid-deploy (the manifest is fetched, a deploy lands, the asset that follows
  disagrees) — refetch once; only a disagreement surviving fresh copies of both is a fault.
- **Mechanism:** prose
- **Retire when:** Retire if these sites ever gain a server that can set per-file headers.
