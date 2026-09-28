## 2026-09-06 · born · Author the cloudflare-workers pack from two fleet backends (91df7ff1)
- **Source:** two fleet members each shipping a Cloudflare Workers backend, `missingbulb/hitbut` and
  `missingbulb/WIP`'s `backend/`. Every rule traces to a named member's committed source or its own
  coded gate rather than to narrative.
- **Reason:** two members ship the facet and no canon pack homed it; a stub-check confirmed nothing
  on the shelf claimed it. The pack is the platform's own limits and deploy-window hazards, plus the
  binding boundary that forces everything else into plain, fake-tested modules.
- **Actor:** the `growth-discover-packs` run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a wrangler config (`toml`, `json` or `jsonc`)
  at the repo root or one directory down, a monorepo's `backend/` or `worker/`, but never deeper, so
  a stray one in a nested fixture or example tree cannot trip detection.
- **Landed:** #1780 (Refs #642) · pack version 60906.1.

## 2026-09-13 · reworded · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Reason:** the routing guidance's `excludes` named `static-website` for a static site with no
  Worker; with a sibling pack now owning a site served from Workers static assets, the boundary a
  router needs is against `cloudflare-site`. The two packs' fingerprints draw the same line: this
  one takes a wrangler config of any shape, the sibling only one declaring a published directory.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the fingerprint's patterns are written as source strings
- **Reason:** a manifest that is data cannot hold a RegExp; each pattern is its source string, or {
  source, flags } where it carries a flag, and loads to the same RegExp.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
