## 2026-09-03 · born · the usage-description paragraph becomes a keyed rule (#1634)
- **Source:** the paragraph it was re-keyed from arrived with the pack (#756), out of LaughCounter's
  `on-device-privacy` local pack: an app that listens and transcribes needs both usage-description
  keys or is killed at whichever it forgot.
- **Reason:** the sweep dropped this pack's framing prose and its section preambles, but this
  preamble was itself instruction, so it was kept as a rule rather than dropped with them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, keyed on the activity rather than the API: triggered on "Reaching
  for a protected resource".
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · moved · into the macos-entitlements-and-tcc skill (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `macos-entitlements-and-tcc` skill; the speech section's
  RULES.md bullet now points at the skill instead of at the section it used to sit above.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
