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

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
