## 2026-09-05 · born · the security-rules discipline becomes a path-forced skill (#1667)
- **Reason:** the owner's bar, set mid-review of the audit this applies, is that a rule leaves
  `RULES.md` for a skill only where the skill's `force-load-on-file-edits-paths` covers every moment
  the rule is needed. A ruleset is written and reviewed in `firestore.rules` and `storage.rules` and
  nowhere else, so a path glob predicts every such moment and seven rules stop costing every other
  session anything.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill with `body: guidelines`, force-loaded for `**/firestore.rules` and
  `**/storage.rules`; the guard holds the edit until it is loaded.
- **Rejected:** a skill reached by description alone. Model-invoked routing is probabilistic, so a
  rule that must hold on every such edit cannot ride it - that is what sent the description-only
  extractions in this audit back to the prose.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
