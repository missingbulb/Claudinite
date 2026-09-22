## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter's shipping artifacts, plus its `macos-audio` local pack for
  the teardown-without-hardware half: let the display sleep and `coreaudiod` tears its device
  contexts down seconds later.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Compile-green is not a gate for device code.".
- **Landed:** #756 (Closes #641) · pack version 1.
