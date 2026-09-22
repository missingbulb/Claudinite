## 2026-08-16 · born · Promote eleven fleet lessons into the canon (#853)
- **Source:** missingbulb/MissingBulbWebsite's local pack, promoted in the fleet growth pass of
  2026-08-15.
- **Reason:** search snippets quote each other, so a number that recurs across five results is one
  source repeated, and the firm the snippets name is routinely not the firm that produced it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Seeing a figure in several places is not evidence of
  who published it." - prose, because the judgment leaves no repo-state signature a check could
  read.
- **Landed:** #853 (Refs #852).

## 2026-09-03 · moved · Path-scoped skills: a skill names the files the guard holds edits for until it is loaded (#1650)
- **Reason:** a rule leaves RULES.md for a skill only where a forced path covers every moment the
  rule is needed. Editing the wiki tree is exactly such a moment, so the page rules are read once,
  by the session that edits, rather than carried as prose by every session in every declaring repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the writing-wiki-pages skill, triggered on "Attributing a figure you
  saw in several places.", in place of its RULES.md bullet.
- **Landed:** #1650 (Closes #1648) · pack version 60903.2.
