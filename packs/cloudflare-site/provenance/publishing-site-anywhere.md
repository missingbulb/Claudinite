## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** prose, keyed to the act of publishing, beside the
  `cloudflare-site/no-second-publisher` check that finds a second publisher already committed.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-18 · reworded · Move versioning out of cloudflare-site into public-website's seam (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the task no longer cuts the version, it advances one that `public-website` owns, and
  with that pack undeclared it cuts nothing at all, so the rule says "advances".
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2101 · pack version 60918.1.
