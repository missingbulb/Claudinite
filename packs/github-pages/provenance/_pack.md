## 2026-09-18 · born · Split the website packs by ownership: public-website, github-pages, cloudflare-site (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** `static-website` conflated what is true of a static site with what is true of one
  served from GitHub Pages, so a repo hosting its site anywhere else could take only half the pack,
  and the half it left behind was where three of the four checks lived. The serving half becomes its
  own pack, rebuilt in the shape `cloudflare-site`'s release already had: a Pages deploy is made of
  marketplace actions only a workflow job can run, so that is all the one vendored workflow carries,
  dispatch-only, and everything else about a release is the `site-release` task. Four workflows and
  three composite actions become one workflow and two scripts; the GitHub Release, the tag and the
  bump dispatch go with the versions they carried, which are `public-website`'s now. The pack names
  no other host: a site is served from Pages or from something else, never both.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** the pack manifest, fingerprinted by `.github/site.config`, the pack's own central
  artifact, and requiring `claudinite-tasks` because the release is a work item rather than a
  workflow.
- **Landed:** #2101 · pack version 60917.1.
