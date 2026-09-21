## 2026-08-08 · born · Add the jwt pack, distilled from The JWT Handbook (#705)
- **Source:** The JWT Handbook §8.1.1, the alg:none attack.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded world-scope rule module under the jwt-validation skill, blocking. Relevance
  first: only non-test JS/TS/Python source that references a JWT surface at all is read, then only
  lines carrying an allowlist that holds "none". Repo state on purpose, because a pre-existing
  allowlist with "none" is a live bypass and must keep firing until it is fixed.
- **Landed:** #705 (Closes #706) · pack version 1.

## 2026-08-15 · converted · the coded module becomes a declaration (#839)
- **Reason:** the five rules were one mechanism, which the declarative vocabulary states as data:
  select non-test source, gate on the library import, bail on an escape word anywhere in the file,
  flag the matching call lines. The review that audited every coded rule for conversion called this
  the cleanest of them; a declaration carries no logic to test, and the fixtures were kept as they
  were.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** `scanFileClasses` and `excludeFileClasses` for the file set, `whenFileMatches` and
  `unlessFileMatches` for the gate and the escape, `matchLines` for the hit. The rule modules, both
  `checks.mjs` files and the pack-local `scan.mjs` are deleted; the two skills'
  `declared-checks.json` carry the rules.
- **Landed:** #839 (Refs #838) · pack version 2.
