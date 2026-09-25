## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** forcing a release, rolling one back, reading a park and knowing what only a person can
  change is operating knowledge wanted at one moment, not in every session; the four properties a
  change to the release must preserve are what a session editing it needs before it edits.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a skill, forced onto any edit of a wrangler config or the release task, so the
  guard holds the edit until it is loaded.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-18 · reworded · Move versioning out of cloudflare-site into public-website's seam (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the first of the four properties a change must preserve now reads through
  `public-website`'s seam rather than off `package.json` directly, and says what happens with that
  pack undeclared: the site is uploaded unversioned and the run says so. The `decision` park lane's
  example follows.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2101 · pack version 60918.1.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
