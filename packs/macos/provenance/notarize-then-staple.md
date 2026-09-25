## 2026-09-15 · born · an unstapled notarization only fails on somebody else's Mac (#2059)
- **Reason:** a submit with no staple anywhere in the repo ships an artifact that carries no ticket
  of its own, so Gatekeeper has to reach Apple the first time a user opens it - and never has to on
  the machine that submitted it, whose ticket is cached. That asymmetry is why the prose alone was
  not holding it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a declared check in `packs/macos/declared-checks.json`, blocking: a script or
  workflow running `notarytool submit` where nothing in the repo runs `stapler staple`. Scoped to
  scripts, workflows and source, so a runbook naming the command neither flags nor excuses. It ships
  `since: 2026-09-15`, biting at its real severity once the two-week window closes.
- **Rejected:** deleting the prose bullet it converts. Under the deletion test it stays whole: it
  also carries `--wait`, `stapler validate` and which container to staple.
- **Landed:** #2059, the canon-prose-to-checks run · pack version 60915.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
