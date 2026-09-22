## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md rule - a runtime browser behaviour with no repo-state signature a static
  check could read.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-09-05 · reworded · Promote three member packs onto the canon shelf (#1693)
- **Source:** CrosswordChat's `local/browser-speech` pack, maintained beside a canon pack the repo
  had never declared.
- **Reason:** takes the one clause the member pack carried and this one did not - run the mic
  preflight even where permission is already granted, since otherwise the device is warmed only on
  the first grant.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1693 (Closes #1692) · pack version 60904.1.
