## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks, the
  same birth `cer-release-workflows.md` records.
- **Reason:** a version that diverges between the manifest and the package ships the wrong number to
  the store, or refuses to publish.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scope coded check, blocking, inert until the repo ships the pipeline (the
  gate `_pack.md` records).
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-08-14 · converted · the coded module becomes a declaration (#820), one JSON file per pack from #827
- **Actor:** @missingbulb (owner).
- **Mechanism:** `checkParsedFiles` over the manifest and the package, the structured-data assertion
  #820 added to the pattern engine; #827 moves the declaration into `declared-checks.json`.
- **Landed:** #820, #827.
