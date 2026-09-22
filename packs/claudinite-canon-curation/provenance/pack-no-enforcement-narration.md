## 2026-07-19 · born · google-identity: prose to skill-owned checks, enforcement-silent canon docs (#350)
- **Reason:** a doc that narrates its own enforcement duplicates the mechanism and springs the drift
  trap: checks run on their own at every Stop and in CI, and each failure message already carries
  its rule.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check over the file each `pack.mjs` declares as prose - it must not tell
  the reader to run the checks runner nor name a rule the pack's own modules define. Gated to the
  canon home by declaration.
- **Landed:** #350 (Refs #303).

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
