## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** three worked implementations in the owner's fleet - GoogleCalendarEventCreator (the
  origin: extension/jsdom rendering, pixel-exact snapshots), TLDR (the cross-tier `server` kind) and
  ShoutsAndWhispers (the Flutter port: golden-file rendering, the fake-world harness and the first
  `saga` implementation).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `RULES.md` bullet in the determinism section.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · from `RULES.md` into the `deterministic-expecteds` skill, whose file records why (#1667)
- **Source:** the audit of every pack's `RULES.md` for rules that only matter while editing a
  nameable file class (#1662).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of that skill, loaded only on the paths it is forced for.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
