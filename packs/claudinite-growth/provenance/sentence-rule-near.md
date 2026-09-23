## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** the file carried 63% of the repo's session rule tokens and was growing about 900
  tokens a day, almost all of it per-rule incident archaeology.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the home local pack's `RULES.md` header, stating the size a rule is written to.
- **Landed:** #1315 (Closes #1312).

## 2026-09-01 · moved · writing-pack-prose: the pack-prose authoring skill and the per-pack references doc (#1561)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** out of the home local pack's `RULES.md` header into the writing-pack-prose skill,
  where every pack's author reads it rather than this repo's alone.
- **Landed:** #1561 (Closes #1560).
