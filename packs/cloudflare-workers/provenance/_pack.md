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
