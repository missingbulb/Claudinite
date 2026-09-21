## 2026-07-29 · born · product-wiki: every wiki page opens with a Key insights header (#542)
- **Reason:** judging obviousness is genuinely hard, so the rule states the error preference
  outright: when in doubt keep the line. A borderline-obvious line costs the reader two seconds; a
  long careful one costs them the header.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Terse, plain, and only the non-obvious.".
- **Landed:** #542 (Closes #543) · pack version 1.

## 2026-09-03 · moved · Path-scoped skills: a skill names the files the guard holds edits for until it is loaded (#1650)
- **Reason:** a rule leaves RULES.md for a skill only where a forced path covers every moment the
  rule is needed. Editing the wiki tree is exactly such a moment, so the page rules are read once,
  by the session that edits, rather than carried as prose by every session in every declaring repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the writing-wiki-pages skill, triggered on "Writing an insight
  bullet.", in place of its RULES.md bullet.
- **Landed:** #1650 (Closes #1648) · pack version 60903.2.
