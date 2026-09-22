## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Pin LSMinimumSystemVersion to the same OS version
  the package's platforms: declares.".
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-05 · moved · into the macos-app-bundle skill (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `macos-app-bundle` skill; `minimum-system-version-agrees`
  follows it, its `doc:` now pointing at the skill.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
