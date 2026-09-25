## 2026-08-17 · born · Claudinite growth: extract lessons (#944)
- **Reason:** #930/#931: five reruns of the ~55s suite cost 4.5 minutes to serve five different
  greps of the same unchanged output.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a clause of the RULES.md rule on running the test suite.
- **Landed:** #944.

## 2026-09-06 · moved · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Reason:** the suite rule had a trigger all along, so it left `RULES.md` by the deletion test for
  the running-the-suite skill, which loads at the moment the call is made.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the running-the-suite skill.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).
