## 2026-08-14 · born · a pack contributes nothing until its id is declared (#836)
- **Source:** the pack's first RULES.md, written with the pack.
- **Reason:** activation reads the literal declaration, so a pack whose files are on disk but whose
  id is undeclared is mounted and inert.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Wanting a pack's rules to apply here".
- **Landed:** #836 (Closes #835, phase 1).
