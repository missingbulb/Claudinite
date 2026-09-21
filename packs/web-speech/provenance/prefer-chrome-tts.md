## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md rule. Its content-script autoplay half has no signature and stays prose;
  the service-worker half rides
  [web-speech-no-window-api-in-service-worker](web-speech-no-window-api-in-service-worker.md).
- **Landed:** #346 (Refs #303) · pack version 1.
