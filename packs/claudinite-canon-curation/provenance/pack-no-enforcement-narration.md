## 2026-07-19 · born · google-identity: prose to skill-owned checks, enforcement-silent canon docs (#350)
- **Reason:** a doc that narrates its own enforcement duplicates the mechanism and springs the drift
  trap: checks run on their own at every Stop and in CI, and each failure message already carries
  its rule.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check over the file each `pack.mjs` declares as prose - it must not tell
  the reader to run the checks runner nor name a rule the pack's own modules define. Gated to the
  canon home by declaration.
- **Landed:** #350 (Refs #303).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
