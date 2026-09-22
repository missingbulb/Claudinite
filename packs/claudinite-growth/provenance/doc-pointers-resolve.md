## 2026-09-04 · born · Declarative checks: the four-moment design, the rule inventory, and pass two (derive → quantify) (#1676)
- **Reason:** a `doc:` field is rendered into a finding's More line and never opened, so seven rule
  modules across four packs had named a path that had not existed since #385.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check doc-pointers-resolve, in packs/claudinite-growth/declared-checks.json.
- **Landed:** #1676 (Closes #1675).
