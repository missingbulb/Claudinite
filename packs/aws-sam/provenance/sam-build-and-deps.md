## 2026-09-05 · born · Rules to skills: the audit's path-forced extractions (#1667)
- **Reason:** a rule leaves RULES.md for a skill only where that skill's
  `force-load-on-file-edits-paths` covers every moment the rule is needed; a skill the model would
  have to pick by description alone is not predictable. These rules are all predicted by an edit of
  the template or the package manifest, so they move, while the deploy-time failures, which no file
  edit predicts, stay in the prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill whose body is guidelines, forced for `package.json` and the template - the
  two files a SAM Lambda's build dependencies are declared in.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
