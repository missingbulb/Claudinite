## 2026-07-31 · born · the tile-attribution rule converts to a check (#607)
- **Source:** the prose-to-checks sweep (#600); the same rule was weighed on #510 and left as prose,
  since attribution can legitimately be registered away from the layer's own options.
- **Reason:** the failure mode is exactly what a post-hoc check catches and a session cannot - the
  credit is dropped while tidying the UI, long after the map was wired, and nothing about the
  running map looks wrong afterwards.
- **Actor:** the prose-to-checks sweep run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a check-the-world rule walking each `L.tileLayer(` call's own argument list to its
  options object and judging only that object's own top-level keys, with a file that registers the
  credit out of band through `addAttribution(` skipped whole - the guard that made the conversion
  confident. Deletion test: the prose bullet stays whole, because it carries a second rule in the
  same breath (set `maxZoom` to the provider's real ceiling) that is a per-provider value no check
  can judge.
- **Rejected:** grepping for `attribution`, which is satisfied by the word appearing anywhere and
  cannot say which layer is missing it; and judging options passed as a variable or built by a
  spread, where absence is not provably absence.
- **Landed:** #607 (Refs #600) · pack version 1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
