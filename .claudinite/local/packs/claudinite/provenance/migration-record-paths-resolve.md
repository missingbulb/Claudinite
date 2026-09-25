## 2026-09-20 · born · converted from references.md (check:migration-record-paths-resolve)
- **Reason:** the fix in #2139: the `task-cadence-terms` record probed
  `packs/claudinite-tasks/calendar.mjs`, which #1890 moved on 2026-09-14 leaving no shim, so both
  arms of its two-root probe missed and `appliesTo` returned false every night for thirteen days
  with nothing red — a member converging after the move never had its `frequency` rewrite. The
  same sweep finds a second instance: the 2026-08-05 sheepdog record still materializes
  `packs/sheepdog/stubs/workflows/fleet-baseline.yml`, a template the 2026-08-19 rename retired, and
  `applyMaterializations` skips a template it cannot read. Both directions fail open by design, so
  the pointer is the only thing that can be checked.
- **Mechanism:** a check
- **Retire when:** Retire the check if migration records stop naming canon paths as literals.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
