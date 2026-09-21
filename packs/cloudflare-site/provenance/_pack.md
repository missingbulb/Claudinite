## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** a repo serving a static tree from Cloudflare Workers static assets on its own domain
  now gets the whole deployment from the canon rather than from the one repo that had built it: the
  nightly release, the boundary of what reaches a public URL, and the parts of the deployment only a
  person holding the Cloudflare account can do. The pack asks its adopters nothing, because
  everything it needs about a deployment (the published tree, the hostnames claimed, whether
  analytics is wanted) is already stated structurally in the repo's own wrangler config and in
  whether a published file carries the beacon placeholder, and a question whose answer is already in
  the tree is a second place for it to be wrong.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a near-root JSON wrangler config that declares
  `assets.directory`. The sibling `cloudflare-workers` pack fingerprints on a wrangler config of any
  shape because it is about the runtime and its bindings; a config declaring a published directory
  is a site, so a Worker backend with no assets carries none of this.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-17 · reworded · cloudflare-site: put a year offset in the release version's date (#2100)
- **Reason:** the minor was a bare `MMDD`, which runs backwards every New Year, `1231` followed by
  `0101`, so "later means bigger" stopped being true once a year and the ordering rested entirely on
  the build counter beside it. The minor now counts years from a fixed epoch before the month and
  day, strictly increasing with no wrap to absorb. Existing adopters cross over with nothing to
  migrate: the old minor was at most four digits and the new one at least five, so every repo's next
  release sorts above its last whatever date it lands on. `patch` became `build`, which is what the
  field had always been, a counter that advances per release rather than per fix.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #2100 · pack version 60917.1.

## 2026-09-18 · split · Move versioning out of cloudflare-site into public-website's seam (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the version, the page stamp and the drift check are not facts about Cloudflare, so
  they leave for `public-website` and the release reaches them through that pack's
  `public/version.mjs` when it is declared, skipping them when it is not. The release keeps its
  shape, the bump before the upload and the bump commit as the gate's high-water mark. A migration
  record declares `public-website` on every member serving from Cloudflare so an adopter keeps its
  versioning without a hand edit, and the old bump path stays as a delegating shim because a
  member's own prose may still run it, its retirement filed as #2113. The pack also stops naming
  `github-pages`: a hosting pack knows no other host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the manifest keeps the serving half only; `bump-version.mjs` becomes a shim and the
  `version-stamp-matches-package` check leaves with the scheme.
- **Landed:** #2101 · pack version 60918.1.
