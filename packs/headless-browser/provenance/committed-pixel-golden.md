## 2026-08-16 · born · Claudinite growth: mint the headless-browser canon pack (#905)
- **Source:** three fleet members that drive a browser from their own process, read in full -
  `missingbulb/EdFringeNow`'s pinned-Chromium visual-requirements harness,
  `missingbulb/CrosswordChat`'s browser rasterisation for goldens and generated store artifacts, and
  `missingbulb/ClaudiniteWebsite`'s interactive responsive check. `missingbulb/EdFringeAllocator`
  carries a vestigial fourth instance in a retired prototype, noted and not leaned on.
- **Reason:** EdFringeNow and CrosswordChat hit the same wall - a browser screenshot is not
  bit-stable across machines - and solved it opposite ways. CrosswordChat lets the build float and
  takes a per-case tolerance; EdFringeNow pins the driver version, refuses to run on any other,
  jails the fonts and passes rasterisation flags. That disagreement is the substance this rule and
  `pinning-buys-zero` carry, and is why the gap earned a pack rather than a rule.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "A committed pixel golden is only comparable under
  the exact build that rendered it.".
- **Landed:** #905 (tracker #642) · pack version 1.
