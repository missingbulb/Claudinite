## 2026-09-18 · born · Rename static-website to public-website and keep only what is true of a website (#2101)
- **Source:** `cloudflare-site`, where the rule and the version scheme were born with that pack
  (#1982), brought in unchanged when the owner ruled on 2026-09-17 that a hosting pack owns only how
  a site is served.
- **Reason:** the same drift the rule states, held by a check rather than remembered: it fires on
  what a hand-edit, a half-applied release and a page added without the stamp all look like. Every
  tracked page carrying the stamp is in scope, generalised from cloudflare-site's read of a
  published tree, because the stamp is the page's own opt-in and this pack knows no served
  directory.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a check, blocking at medium severity, over every tracked page.
- **Retire when:** the version stops being copied into the pages.
- **Landed:** #2101 · pack version 60913.2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
