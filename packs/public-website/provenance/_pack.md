## 2026-08-01 · born · static-website pack: date-anchored versions, release-on-push, explicit publish set (#611)
- **Source:** the standard our static-site repos were already running by hand, written down as one
  pack (Closes #609).
- **Reason:** one pack for the whole flow so a site repo hosts the pipeline without owning it: the
  version scheme, release on push, the PR gate and the published artifact, authored once in the
  pack's stubs and vendored into each repo's own `.github/` because GitHub resolves reusable
  workflows and composite actions only from there.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by the vendored orchestrator workflow, so a repo
  declaring the pack for the versioning half while it deploys elsewhere carries none of it.
- **Rejected:** publishing the repo root minus the directories we remember to hide. A subtractive
  rule publishes every draft, note and key nobody thought to exclude, and publishes each new one
  silently the day it lands; an additive list can only publish what the repo asked for, and its
  failure mode is visible.
- **Landed:** #611 (Closes #609) · pack version 1.

## 2026-08-20 · reworded · Pack reorganization: two collapses and two renames (#1081)
- **Reason:** `requires` stops naming `github-actions`, which collapsed into `git-github`; the
  surviving pack arrives on its own through basics' own `requires` closure, so naming it here bought
  nothing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1081 · pack version 4.

## 2026-08-23 · reworded · Pack manifests by convention: the tree declares the pack (#1248)
- **Reason:** `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` resolve from the pack
  directory, and an absent `detect`/`marker` means no fingerprint. A corpus-wide decision, cited
  here.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1248 · pack version 60822.1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened on a paragraph saying what the pack covers and pointing at the release
  contract. Every session in every declaring repo paid for it and neither line changed what a
  session does. A corpus-wide decision, cited here.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 · pack version 60902.1.

## 2026-09-18 · split · Split the website packs by ownership: public-website, github-pages, cloudflare-site (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the pack conflated what is true of a static site with what is true of one served from
  GitHub Pages, so a repo hosting its site anywhere else could take only half of it and the half it
  left behind was where three of the four checks lived. What stays under the new name is what is
  true of a public website whatever serves it: the version, the page stamp and the client-side
  caching rules. The site config, the composite actions, the CI gate, their checks and the
  `static-site-releases` skill leave for the hosting packs; the subpath rule leaves for
  `github-pages`; the version-moves-with-the-change rule goes with the release flow that enforced
  it. The scheme itself is cloudflare-site's, brought in unchanged, and its middle part counts years
  from 2025 so a version never sorts backwards at New Year. It is exposed through
  `public/version.mjs` rather than run directly, so a hosting pack's release advances the version
  with no dependency on this pack and goes out unversioned when the file is absent. The pack had no
  adopters, so nothing was migrated and no legacy spelling was carried beyond the rename map and the
  record that converges declarations.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** the pack manifest under the new id `public-website`, fingerprinted by a tracked
  page carrying the `title="version …"` stamp rather than by a workflow, so the pack suspects
  itself from its own artifact and knows no served directory.
- **Landed:** #2101 · pack version 60913.2.
