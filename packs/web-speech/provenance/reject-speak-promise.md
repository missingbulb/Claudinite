## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md rule - a runtime browser behaviour with no repo-state signature a static
  check could read.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-09-06 · reworded · Prose-to-checks sweep: trim the RULES.md bullets checks now cover (a29cf8d2)
- **Reason:** the promotion in #1693 landed `tts-speak-settles` but left the prose beside it
  untouched. Applying the prose-to-checks deletion test, the bullet keeps only the half the check
  cannot see - why resolving rather than rejecting matters, and the `enqueue: false` turn-taking -
  and drops the terminal-event enumeration the check now reproduces.
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Landed:** commit a29cf8d2 (Refs #1766) · pack version 60906.1.
