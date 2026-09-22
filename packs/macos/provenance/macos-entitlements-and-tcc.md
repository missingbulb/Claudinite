## 2026-09-05 · born · the TCC and entitlement rules move into a forced skill (#1667)
- **Reason:** as for `macos-app-bundle`: the rules are needed exactly when an entitlements file or
  `Info.plist` is edited, which is what the owner's bar asks of a skill carrying a rule.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the `macos-entitlements-and-tcc` skill, body guidelines, held by the guard for any
  edit of `**/*.entitlements` or `**/Info.plist`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
