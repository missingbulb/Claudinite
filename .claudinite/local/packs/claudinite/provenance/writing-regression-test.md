## 2026-09-01 · born · Claudinite growth: extract lessons (#1558)
- **Source:** #1540, closing #1539: a test asserting the literal retired sentence "never move a file
  into `.github/workflows`".
- **Reason:** it stayed green through #1511 precisely because it required the contradiction to still
  be present, letting three artifacts disagree with no check catching it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Writing a regression test that pins a policy or
  convention decision".
- **Landed:** #1558 (Refs #1551).
