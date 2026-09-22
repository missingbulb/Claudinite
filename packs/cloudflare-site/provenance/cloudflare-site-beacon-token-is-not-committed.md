## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** a committed beacon token beacons from every checkout, fork and local preview into the
  production site's numbers, and the page is identical either way. The matcher strips a script's
  comments first, so a commented-out loader, which beacons nothing, does not read as a committed
  token.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a check, blocking at high severity, filed under legal rather than correctness.
- **Retire when:** the loader stops taking its token from the served file.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
