## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Reason:** one of the two gotchas with an honest file-scoped signature, so it graduated off prose
  to a check whose failure message is the rule, with no prose copy to drift from.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a coded check in `skills/web-speech-io/service-worker-speech.mjs`, blocking, gated
  to the single file an MV3 manifest names as `background.service_worker` and only where that path
  is the project's own authored source - a skill check runs on every repo, so the gate is narrow.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-08-16 · converted · The remaining conversion tranches: files named by a parsed field (#908)
- **Reason:** the last coded rule the skill carried; converting it left the skill holding
  declarations alone, so its `checks.mjs` went with it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declaration whose `scanFiles` reads the file set out of another parsed document -
  the path an MV3 `manifest.json` names as `background.service_worker`, resolved against the
  manifest's own directory. Authored red-first against the coded rule's own fixtures, the module
  deleted in the same commit.
- **Landed:** #908 (Refs #880) · pack version 2.
