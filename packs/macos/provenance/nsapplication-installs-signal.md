## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** the bullet was kept beside the `signal-teardown-routing` check that landed with it,
  because it also carries the residual risk no check sees: `SIGKILL`, Force Quit and a crash stay
  uncoverable.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "NSApplication installs no signal handlers".
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-06 · converted · trimmed to the half the check cannot see (#1781)
- **Reason:** the deletion test, applied partially: `signal-teardown-routing` covers the routing and
  the `SIG_IGN` remedy, so that half of the bullet goes; the residual-risk caveat stays, because
  `SIGKILL`, Force Quit and a crash are uncoverable by any check.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the rule is now carried jointly - the check for the routing, the RULES.md bullet
  for what the check cannot judge.
- **Landed:** #1781 · pack version 60906.1.
