## 2026-08-12 · born · a `command -v swift` probe is a test of the stub, not of a toolchain (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** `/usr/bin/swift` ships on every Mac as a stub: run without a developer directory it
  does not fail but pops the "install the command line developer tools?" panel, an 8 GB download
  prompted at whoever is diagnosing a broken app. So `command -v swift` reports success on exactly
  the toolchain-less Mac a diagnostic script is meant to degrade on. Learned on LaughCounter, whose
  owner's Mac installs the DMG from CI and carries no Xcode tools.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "`command -v swift` does not test for a Swift
  toolchain.".
- **Retire when:** reaffirm while the stub behaviour stands; retire if Apple stops shipping it or
  makes it fail cleanly.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-05 · converted · the check the prose was missing (#1693)
- **Source:** LaughCounter's `local/macos-audio`, which had been maintaining the check beside a
  canon pack the project never declared.
- **Reason:** the pack's prose already carried the rule; the check was the missing half. The probe
  must sit behind an `xcode-select -p` gate, which a scan over shell and workflow files can judge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded check, `packs/macos/worldRules/swift-toolchain-gate.mjs`, blocking. The
  RULES.md bullet stayed for now: the deletion test is applied only once a check exists, and it was
  applied the following day.
- **Landed:** #1693 (Closes #1692) · pack version 60904.1.

## 2026-09-06 · moved · the check is now the sole carrier (#1781)
- **Reason:** the deletion test, applied once the check existed: the finding's what, why and fix
  fully reproduce the bullet, so the bullet is deleted whole rather than trimmed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** the RULES.md bullet is deleted; `swift-toolchain-gate` carries the rule alone.
- **Landed:** #1781 · pack version 60906.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
