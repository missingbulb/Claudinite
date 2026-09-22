## 2026-07-19 · born · Bring the canon into the conversation lifecycle; conversation-extract as a fleet run_daily task (#356)
- **Reason:** the canon's own sessions were outside the conversation lifecycle, and its non-portable
  lessons had nowhere to land: a lesson that travels becomes a `packs/` pull request, everything
  else needed a home in the repo itself.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest.
- **Landed:** #356 (Closes #355, Closes #357).

## 2026-09-04 · scope-changed · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** everything about the packs on the shelf - naming, config, modules, checks, prose -
  moved to the new curation pack, leaving this one Claudinite's own scope, standing decisions and
  engine maintenance. Both packs' routing guidance says so.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `ruleRoutingGuidance` on the manifest, rewritten on both sides of the line.
- **Landed:** #1674 (Refs #1673).

## 2026-09-22 · reworded · the manifest header keeps what the pack is, and nothing else (#2169)
- **Reason:** the header carried why the pack exists, how discovery reaches it, what activates it
  and which check rides beside it. Those are decisions about the pack's shape, so they read from
  this file now; a reader of the code needs only what the pack is.
- **Actor:** @missingbulb (owner), through the provenance backfill.
- **Model:** Claude Opus 5
