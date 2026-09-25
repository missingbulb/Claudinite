## 2026-08-24 · born · Claudinite growth: extract lessons (#1310)
- **Source:** the growth-extract run over the window in #1305.
- **Reason:** #1274: `git ls-files` excludes a test file created and not staged, so the run that
  certified green may never have executed it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a clause of the RULES.md rule on running the test suite.
- **Landed:** #1310 (Refs #1305).

## 2026-09-06 · moved · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Reason:** the suite rule had a trigger all along, so it left `RULES.md` by the deletion test for
  the running-the-suite skill, which loads at the moment the call is made.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the running-the-suite skill.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).
