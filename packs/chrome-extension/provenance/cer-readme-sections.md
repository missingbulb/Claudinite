## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks, the
  same birth `cer-release-workflows.md` records.
- **Reason:** every extension repo documents install and release the same way, from the standard's
  template; a README missing those sections is off the standard.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scope coded check, blocking, inert until the repo ships the pipeline (the
  gate `_pack.md` records).
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-08-13 · converted · the coded module becomes a declaration (#790), one JSON file per pack from #827
- **Reason:** the check reads one file for required sections, which the declarative pattern engine
  states as data; a declaration carries no logic to test.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `checkEachFile` over the README, `scanIgnoringMarkdownFences`, `whenMissing` naming
  the template section; #827 moves every pack's declarations into `declared-checks.json`, where the
  registry discovers them structurally.
- **Landed:** #790, #827.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
