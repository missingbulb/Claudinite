## 2026-09-06 · born · Rules to checks with the four-moment mechanisms (#1779)
- **Reason:** the conversion pass over the three packs every session in this repo loads, applying
  the prose-to-checks deletion test to the rows the rule inventory classified as convertible.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a declared work check, blocking, a two-pass over the change's own added engine
  exports, carrying `since: 2026-09-06`. Converted from the rule on consuming a brand-new engine
  export.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.

## 2026-09-25 · scope-changed · an edited export line no longer counts as a new export
- **Reason:** the engine's added-lines value source now drops a value a removed line of the same
  file also carried, so a changed signature or an `ENGINE_VERSION` bump stops reading as a brand-new
  export; before, every engine release tripped it on a test importing `ENGINE_VERSION`.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the declared check unchanged; the fix is in `fromAddedLinesMatching`, its only
  user.
