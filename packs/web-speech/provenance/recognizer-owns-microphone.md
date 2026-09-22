## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md rule - a runtime browser behaviour with no repo-state signature a static
  check could read.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the shelf-wide pass cut consequence prose arguing for a rule rather than enabling it;
  here the clause restating that the recognizer still captures on its own.
- **Actor:** @missingbulb (owner).
- **Landed:** #467 (Closes #466) · pack version 1.
