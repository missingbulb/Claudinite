## 2026-09-21 · born · the file starts here; the check's earlier history is not backfilled yet
- **Reason:** this file was empty when the change below was made, and the clone it was made from
  carries too little history to derive the check's origin. The backfill that fills it is its own
  pull request and replaces this entry with the derived history.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check in the pack's worldRules.

## 2026-09-21 · severity-changed · it judges directories now, because that is what the reader opens (#2188)
- **Reason:** the check exists to say the one thing the fail-soft reader never can: a name nobody
  will ever open. The reader now pours `<path>/<email>/`, so a flat file in the store is the
  unaddressable shape and a directory named for an identity is the clean one.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity — advisory, relevance-gated on this repo actually
  holding the store. What moved is its scope: one finding per top-level entry rather than per file,
  because a misnamed directory holding a whole pack is one mistake with one fix.
- **Landed:** #2188
