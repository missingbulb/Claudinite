## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Capabilities gated purely by TCC plus their usage
  string need no entitlement at all".
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-05 · moved · into the macos-entitlements-and-tcc skill (#1667)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a guideline of the `macos-entitlements-and-tcc` skill, whose forced paths cover the
  moment it is needed.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
