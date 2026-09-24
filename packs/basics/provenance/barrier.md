## 2026-07-13 · born · Add `barriers` pack - enforce a directed folder-access graph (#267)
- **Reason:** segregation is expressed once, as a directed folder-access graph the project declares,
  rather than as a bespoke check per boundary; the unit is a reference that resolves to a real
  tracked path inside the barred folder, which is what makes it language-agnostic and keeps a mere
  mention of a folder name from firing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** check barrier, in packs/basics/worldRules/barrier.mjs.
- **Rejected:** bare folder-name-only mentions and class or function symbol references, both
  deferred from v1 as too noisy or needing per-language symbol resolution.
- **Landed:** #267, closing #266.
