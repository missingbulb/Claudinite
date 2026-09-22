## 2026-08-30 · born · Claudinite: growth-extract lessons (#1440)
- **Source:** the growth-extract run over the window in #1426.
- **Reason:** an older engine's unknown-key throw drops every declaration in the file and wedges the
  member's convergence until a human deletes it by hand; the interim caution while #1400's real fix
  was undecided.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Adding a key to the declared-check spec vocabulary".
- **Landed:** #1440 (Refs #1426).

## 2026-09-01 · reworded · Report an unplaceable declared-check key instead of throwing on it (#1544)
- **Reason:** the load now drops an unplaceable key and reports it instead of throwing, so the
  interim caution's wedge is gone; what is left is that the new key buys nothing until its engine
  arrives.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1544 (Closes #1400).
