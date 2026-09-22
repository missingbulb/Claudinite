## 2026-09-06 · born · Rules to checks with the four-moment mechanisms (#1779)
- **Reason:** the conversion pass over the three packs every session in this repo loads, applying
  the prose-to-checks deletion test to the rows the rule inventory classified as convertible.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a declared work check, blocking, a two-pass over the change's own added engine
  exports, carrying `since: 2026-09-06`. Converted from the rule on consuming a brand-new engine
  export.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.

## 2026-09-22 · scope-changed · it stops watching a pack's tests (#2261)
- **Reason:** a pack's `test/` directory is dropped from every vendor set, so no member ever holds
  one and a test's named import cannot fault a member's pack load. It was firing on exactly that, on
  a change that only rewrote an existing export's declaration line.
- **Mechanism:** the declaration's `forbidEveryFileMatching.pathMatching`, which now excludes
  `*.test.mjs` and anything under a pack's `test/` - the same "the name is the rule" boundary the
  vendor set itself draws.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
