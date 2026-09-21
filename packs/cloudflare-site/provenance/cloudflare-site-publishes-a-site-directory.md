## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** `assets.directory` is the only boundary between the published site and the repo
  holding the vendored mount, the packs and the queue's workers. Widening it to the repo root
  publishes all of that to a public URL, and the deploy reports success either way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a check, blocking at critical severity, on the wrangler config the pack
  fingerprints on.
- **Retire when:** a Cloudflare deployment gains a second, independent statement of what is
  uploaded.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.
