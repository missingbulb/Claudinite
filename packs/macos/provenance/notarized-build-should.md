## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "A notarized build should need none of that".
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-05 · retired · the notarized-build line moves to the README (#1667)
- **Reason:** it describes rather than instructs - it names the sign that the signing lane is not
  running - so the audit moved it out of RULES.md, where every session in every declaring repo pays
  for it, into the pack README beside the skills paragraph. No carrier has named it since.
- **Actor:** @missingbulb (owner).
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
