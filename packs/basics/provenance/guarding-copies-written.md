## 2026-09-06 · born · converted from references.md (RULES-4)
- **Reason:** From `missingbulb/MissingBulbWebsite` via #1303: two copies of one constant table in
  different languages could not be paired by literal value because `"150"` is a substring of
  `"1500"`, so a value-matching guard mispaired rows silently. Pairing by name through the casing
  transform needs no per-value upkeep.
- **Mechanism:** prose
- **Retire when:** Retire the clause if the guard helper gains value-boundary matching.
