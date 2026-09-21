## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Reason:** the second gotcha with an honest file-scoped signature.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a coded check in `skills/web-speech-io/recognition-feature-detect.mjs`, advisory -
  a lone direct construction is a smell to judge, not proof of a break. The gate is the anti-pattern
  itself, suppressed the moment the file mentions the unprefixed name: a conservative gate that
  would rather miss than false-flag.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-08-14 · converted · Declared checks are JSON, one file per pack (#827)
- **Reason:** the declaration was a module of about seventeen lines that held nothing but data. A
  pack's declarations become one JSON file discovered structurally, so writing the declaration adds
  the check - no import, no manifest line. JSON cannot hold a comment, which enforces the
  no-comments-on-a-check rule by construction, and the check states its own case rather than
  deferring to a `doc` pointer.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declaration in the web-speech-io skill's `declared-checks.json`, replacing the
  coded module. Severity and findings unchanged.
- **Landed:** #827 (Closes #826) · pack version 2.
