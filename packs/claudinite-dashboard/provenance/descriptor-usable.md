## 2026-08-22 · born · Let any pack contribute its key figures to the dashboard (#1195)
- **Source:** #1194, and the design document the same change wrote for the contribution contract.
- **Reason:** a pack contributes data, never code, so a descriptor is the whole of what it ships -
  and a bad one fails silently: it renders as one apologetic line in someone else's browser and
  nothing goes red where the author is looking. The check holds a descriptor to what the page's OWN
  reader accepts, which the JSON Schema beside it structurally cannot.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a world check, `packs/claudinite-dashboard/worldRules/descriptor-usable.mjs`, over
  a descriptor found by path convention, `packs/<id>/dashboard.json`, which nothing registers.
- **Rejected:** a `contributes` manifest key as the descriptor's home - the engine reads a manifest
  in-process, where importing `pack.mjs` is ordinary, but the dashboard reads other repos over the
  API, where it is not possible.
- **Landed:** #1195 (Closes #1194) · pack version 60822.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
