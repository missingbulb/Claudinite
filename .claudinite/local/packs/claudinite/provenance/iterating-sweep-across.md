## 2026-08-19 · born · Claudinite growth: extract lessons (#1015)
- **Source:** the growth-extract run over the 2026-08-18 window.
- **Reason:** measured: the session that landed #993 spent eighteen full-suite runs and twenty-two
  world sweeps out of twenty-six minutes of tool wall-clock, and both are whole-tree aggregates
  whose verdict cannot turn on one file of a sweep.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Iterating on a sweep across many files".
- **Landed:** #1015 (Refs #1014).
