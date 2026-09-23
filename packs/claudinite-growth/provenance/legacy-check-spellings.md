## 2026-09-03 · born · Legacy behaves like deprecated: the guideline, the annotation, and the advisories (#1645)
- **Reason:** a tolerance with no advisory never reaches its holders, and the audit found about 28
  declaration sites warning nobody.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check legacy-check-spellings, in packs/claudinite-growth/declared-checks.json.
- **Landed:** #1645 (Closes #1637).

## 2026-09-21 · scope-changed · Retire the remaining scattered legacy residues (#1917)
- **Reason:** five of the six pre-merge spellings had no advisory of their own, so removing the
  normalizer would have retired tolerances whose holders were never told.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the check names all six pre-merge spellings rather than the one it shipped with.
- **Landed:** #1917 (Refs #1643).
