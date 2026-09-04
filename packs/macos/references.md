# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(check:swift-toolchain-gate)** `/usr/bin/swift` ships on every Mac as a stub: run without a
  developer directory it does not fail but pops the "install the command line developer tools?"
  panel, an 8 GB download prompted at whoever is diagnosing a broken app. So `command -v swift`
  reports success on exactly the toolchain-less Mac a diagnostic script is meant to degrade on,
  and is a test of the stub's presence rather than of a toolchain. Learned on LaughCounter,
  whose owner's Mac installs the DMG from CI and carries no Xcode tools. Reaffirm while the
  stub behaviour stands; retire if Apple stops shipping it or makes it fail cleanly.
