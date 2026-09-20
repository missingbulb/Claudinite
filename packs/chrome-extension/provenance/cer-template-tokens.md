## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks, the
  same birth `cer-release-workflows.md` records.
- **Reason:** the setup contract says to grep for `__` afterwards; a template token that survives
  ships as text.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scope coded check, blocking, inert until the repo ships the pipeline (the
  gate `_pack.md` records).
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-08-13 · converted · the coded module becomes a declaration (#790), one JSON file per pack from #827
- **Actor:** @missingbulb (owner).
- **Mechanism:** `scanFiles` and `scanTracked` naming the vendored set, `matchLines` on the token;
  #827 moves the declaration into `declared-checks.json`.
- **Landed:** #790, #827.
