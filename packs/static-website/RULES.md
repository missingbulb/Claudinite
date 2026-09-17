# Static website

- **Adding a page, stylesheet or data file the site serves** — put it under an already-published
  path or add it to `publish_paths` in the same change; the artifact is that list and nothing else,
  so an unlisted file 404s on a live site whose build, deploy and checks were all green. (1)

- **Changing anything under the publish set** — raise the version in the same PR with
  `node .github/actions/bump-site-version/bump.mjs $(the repo's version_files)`, never by hand: the
  release ships what it finds on the default branch, so a published change without a bump is never
  released at all. (2)

- **Deciding how long a published asset may be cached** — publish a manifest naming every asset
  and a hash of its contents, fetch that on each load and evict the entries whose hash moved,
  rather than giving each file a TTL guessed from how fast you think it changes. (3)

- **Caching a freshness manifest, or judging an asset stale by its size** — neither works: nothing
  can attest to its own freshness, so the expected hash must come from a file fetched fresher than
  the one it judges, and a uniform correction is routinely byte-length-neutral. (4)

- **Splitting a payload so each half caches on its own schedule** — have each half record the
  other's generation and refetch both on a mismatch, because every visitor eventually holds one
  half from Tuesday and the other from Thursday; then assert on the join *rate*, since a partial
  join is silent. (5)

- **Judging a failed fetch survivable because the value "just shows as unknown"** — trace it to
  what it draws first. An absent value reaching a boolean, a comparison or a status lookup is
  usually indistinguishable from a real negative, so the page renders a confident falsehood with
  nothing logged. Where it isn't survivable, fail the load and show the error state. (6)
