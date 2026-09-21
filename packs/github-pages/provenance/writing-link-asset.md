## 2026-08-01 · born · static-website pack: date-anchored versions, release-on-push, explicit publish set (#611)
- **Reason:** every local preview, `file://`, `python -m http.server` and most dev servers, serves
  the site at a domain root, so a root-relative URL is correct there and wrong only once deployed,
  where nothing reports it but a 404 on the live page. A custom domain moves the site back to the
  root and makes the rule moot for that repo, which is why the rule states the subpath as the
  default rather than as an absolute.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** prose.
- **Retire when:** these sites standardise on custom domains, or the local preview is replaced by
  one that serves from the repo subpath.
- **Landed:** #611 (Closes #609) · static-website pack version 1.

## 2026-09-18 · moved · Split the GitHub Pages half of static-website into a github-pages pack (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the subpath is a fact about how Pages serves a site, not about being a website, so it
  goes with the serving half. It is the one rule `static-website` genuinely lost in the split.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** prose in this pack's `RULES.md`.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-18 · reworded · Cut both packs' rules to the ration, evidence into references.md (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the rule ran 150 to 200 words where the format asks for one sentence near 40, and
  opened on a state of the world rather than on the act that brings a reader to it. It is now keyed
  to writing the link and carries only the consequence needed to apply it under pressure; nothing is
  weakened and nothing is strengthened, and the rationale moves to the pack's `references.md`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2101 · pack version 60917.1.
