## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** the #717 fleet sweep, which found three members taking data from a site they don't own
  (EdFringeNow's GraphQL scraper, EdFringeAllocator's hydration-blob fetcher and
  GoogleCalendarEventCreator's extractor pipeline), and no canon pack homing the facet.
- **Reason:** every line of the pack traces to a named member's real files; the two rules resting on
  a single member were flagged rather than dropped.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** the pack manifest, with no `detect` and no `marker`: declaration is authoritative.
  A scraper is ordinary HTTP client code in whatever language the project already uses, and the same
  call sites appear in any project talking to an API it *does* own, so every candidate signature
  suspects the pack in repos that want nothing to do with it.
- **Rejected:** checks, and a fingerprint. Every rule here is about a *remote* service's behaviour
  (which field is authoritative, whether an instant is UTC, when a 200 is a bot wall), none of it
  written into repo state in a shape a deterministic check could read without firing on ordinary
  HTTP code. Prose plus one skill instead: the one-off reconnaissance procedure has a nameable
  trigger, so it descends to a skill rather than sitting in always-loaded prose.
- **Landed:** #739 (Refs #717) · pack version 1.

## 2026-08-23 · reworded · Pack manifests by convention: the tree declares the pack (#1248)
- **Reason:** the manifest stops restating its own tree (`id`, `prose`, `badge`, `skills`,
  `worldRules` and `workRules` resolve from the pack directory), and an absent `detect`/`marker` now
  *means* no fingerprint, so this pack's declaration-only stance is carried by absence rather than
  by an explicit `null`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1248 · pack version 60822.1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the facet paragraph, the "a default to adapt, not a contract" line and the
  language-agnostic note left `RULES.md`; the README already carries them, and every session in
  every declaring repo paid for them in always-loaded prose.
- **Actor:** @missingbulb (owner).
- **Landed:** #1634 · pack version 60902.1.
