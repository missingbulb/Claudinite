## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md rule. A top-level `getVoices()` cache needs an AST rather than a regex
  to see, so the rule stayed prose at this point.
- **Landed:** #346 (Refs #303) · pack version 1.
