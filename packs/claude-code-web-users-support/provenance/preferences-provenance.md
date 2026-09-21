## 2026-09-21 · born · the file starts here; the check's earlier history is not backfilled yet
- **Reason:** this file was empty when the change below was made, and the clone it was made from
  carries too little history to derive the check's origin. The backfill that fills it is its own
  pull request and replaces this entry with the derived history.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check in the pack's worldRules.

## 2026-09-21 · severity-changed · a person's provenance moved inside their own pack (#2188)
- **Reason:** the sidecar `<path>-provenance/<email>/` existed because the store was flat and could
  hold nothing but `<email>.md`. A person's directory is a pack, so its provenance belongs at
  `provenance/` inside it, like every other pack's.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity. Its scope narrowed to the pack's own RULES.md: a
  person's pack also carries skill bodies and its own provenance files, and reading one of those as
  a rule index would report its every bullet.
- **Landed:** #2188
