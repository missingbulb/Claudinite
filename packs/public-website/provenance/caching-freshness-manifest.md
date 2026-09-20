## 2026-09-18 · born · converted from references.md (RULES-4)
- **Reason:** A stale file carries a perfectly valid hash *of itself*, and an internal `"version"`
  field states which generation it is, never whether that generation is current — so caching the
  manifest does not save a round-trip, it moves the staleness up a level and hides it better. On
  length: a correction applied uniformly across a file is routinely byte-length-neutral — a
  timezone fix rewriting every `16:25` to `17:25` moved **0 bytes** of a 3.1 MB catalogue while
  changing the meaning of every record in it. Record the manifest's hash beside the entry as you
  write it, so the check is a string compare rather than megabytes through a digest on the critical
  path of every load.
- **Mechanism:** prose
