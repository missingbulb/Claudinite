## 2026-08-18 · born · Promote 4 lessons from EdFringeNow and TLDR (#985)
- **Source:** `missingbulb/EdFringeNow`'s local pack, the only one of the swept members with browser
  content landed since the previous promote run.
- **Reason:** the default network abort this pack already prescribes leaves an unvendored CDN
  library's global undefined, so the render comes back empty and reads as a product bug to anyone
  who does not know the cause - a cost the abort rule creates and does not answer. Landed at the
  prose rung: a runtime judgment with no static repo signature a check could carry.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "When a page depends on a third-party library loaded
  from a CDN you have not vendored, stub the library's own API surface rather than trying to make
  the CDN reachable.".
- **Landed:** #985 (Refs #983) · pack version 3.
