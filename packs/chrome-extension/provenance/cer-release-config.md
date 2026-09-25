## 2026-07-10 · born · the explicit `.github/release.config`, and the check that reads it (#205)
- **Source:** the consolidation of the per-repo release footprint to one orchestrator stub plus a
  required, explicit five-key `.github/release.config`.
- **Reason:** the config is explicit with no defaults: a missing or typo'd key would ship the wrong
  thing with no signal.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scope coded check, blocking, inert until the repo ships the pipeline (the
  gate `_pack.md` records).
- **Landed:** #205 (Refs #209) · pack version 1.

## 2026-08-14 · converted · the coded module becomes a declaration (#820), one JSON file per pack from #827
- **Actor:** @missingbulb (owner).
- **Mechanism:** `checkKeyValueFile` over `.github/release.config`, the structured-data assertion
  #820 added to the pattern engine; #827 moves the declaration into `declared-checks.json`.
- **Landed:** #820, #827.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
