## 2026-09-18 · born · Rename static-website to public-website and keep only what is true of a website (#2101)
- **Source:** `cloudflare-site`, where the rule and the version scheme were born with that pack
  (#1982), brought in unchanged when the owner ruled on 2026-09-17 that a hosting pack owns only how
  a site is served.
- **Reason:** the stamp is a generated copy of `package.json`'s version, and a copy that drifts
  names a build that was never served while the page looks perfectly normal. The repair consumes no
  version number, so a drifted page is fixed without cutting a release.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** prose, keyed to the act of typing a version into a page, beside the
  `public-website/version-stamp-matches-package` check that catches a stamp that has already
  drifted.
- **Retire when:** the version stops being copied into the pages.
- **Landed:** #2101 · pack version 60913.2.
