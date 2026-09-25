## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks, the
  same birth `cer-release-workflows.md` records.
- **Reason:** the release artifacts live at the standard's paths, or the pipeline cannot find them.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scope coded check over the required release files, blocking, inert until
  the repo ships the pipeline (the gate `_pack.md` records).
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-07-07 · weakened · requires only `PRIVACY.md` once the generated release docs go (#155)
- **Reason:** the per-repo `releasing.md` and `STORE-LISTING.md` only drifted from state kept
  elsewhere (the stubs, the manifest, the store dashboard), so they are no longer required; the
  privacy policy is the one release artifact that belongs in the repo, deployed verbatim as the
  public privacy page the store listing points at.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** #155 (Refs #153) · pack version 1.

## 2026-08-14 · converted · the coded module becomes a declaration (#800), one JSON file per pack from #827
- **Actor:** @missingbulb (owner).
- **Mechanism:** `requirePaths`, the cross-file tree assertion #800 added to the pattern engine;
  #827 moves the declaration into `declared-checks.json`.
- **Landed:** #800, #827.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
