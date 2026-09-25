## 2026-08-08 · born · Add the jwt pack, distilled from The JWT Handbook (#705)
- **Source:** The JWT Handbook §8.1.2, the RS256-public-key-as-HS256-secret confusion, and §8.2.1.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded world-scope rule module under the jwt-validation skill, blocking, gated on
  a JWT library reference before any scanning, exempting test paths and taking the same file-level
  benefit-of-the-doubt fallback as `google-token-audience-pinned` to stay false-positive-free.
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

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
