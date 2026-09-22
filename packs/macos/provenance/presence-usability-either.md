## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter's shipping artifacts, plus its `macos-audio` local pack for
  the engine layer: with the input torn down, `outputFormat(forBus: 0)` still reports a plausible
  rate while `inputFormat` reports 0, so both must be read and required to agree.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Presence is not usability, at either layer.".
- **Landed:** #756 (Closes #641) · pack version 1.
