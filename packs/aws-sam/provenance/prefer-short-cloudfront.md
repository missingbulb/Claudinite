## 2026-07-11 · born · Growth promote (2026-07-11): portable lessons into canon (#222)
- **Source:** the TLDR project's local docs, lifted by the growth lifecycle's promote phase; the run
  names its origins per project rather than per rule.
- **Reason:** promoted at the prose rung - platform-gotcha knowledge with no static signature that
  could be authored and fixtured unattended.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Landed:** #222 · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the sweep cut from every rule in the corpus the consequence prose arguing for a rule
  rather than enabling it, leaving each as trigger, instruction, and at most one clause of why. This
  pack went from 984 words to 885.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-09-05 · moved · Rules to skills: the audit's path-forced extractions (#1667)
- **Reason:** a rule leaves RULES.md for a skill only where that skill's
  `force-load-on-file-edits-paths` covers every moment the rule is needed; a skill the model would
  have to pick by description alone is not predictable. These rules are all predicted by an edit of
  the template or the package manifest, so they move, while the deploy-time failures, which no file
  edit predicts, stay in the prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** from RULES.md into the sam-template skill, forced for `**/template.yaml` and
  `**/template.yml`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
