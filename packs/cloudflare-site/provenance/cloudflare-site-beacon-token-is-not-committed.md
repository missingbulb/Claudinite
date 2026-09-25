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

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
