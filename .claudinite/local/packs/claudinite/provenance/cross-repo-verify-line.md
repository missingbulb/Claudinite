## 2026-09-06 · born · converted from references.md (check:cross-repo-verify-line)
- **Reason:** Three ad-hoc cross-repo `Verify:` items each parked on a scope denial minutes after
  being picked (#1349, #1351, #1396) — the executor provisions agent sessions with this repo's
  scope only. The coded form has the same wall for anything but a public unauthenticated URL, which
  #1790 crossed with an `api.github.com` probe (#1792), so the guard watches the probe lines too.
- **Mechanism:** a check
- **Retire when:** Retire the rule only if executor sessions gain cross-repo scope and probes gain a
  credential.

## 2026-09-06 · scope-changed · Say the hold's unreadable variable once, and keep verifications inside this repo (#1793)
- **Reason:** it watched the agentic `Verify:` line only; the coded form's
  `Live-probe:`/`Verify-probe:` lines are the structurally identical sibling.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `api.github.com` in either form's line; a member's public raw or Pages URL stays
  fine and is pinned as a non-firing case.
- **Landed:** #1793 (Closes #1791, Closes #1792).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
