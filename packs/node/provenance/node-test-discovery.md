## 2026-09-05 · born · the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Source:** the rules-to-skills audit #1662, applied under the bar the owner set mid-review: a
  rule leaves `RULES.md` for a skill only where that skill's `force-load-on-file-edits-paths` covers
  every moment the rule is needed.
- **Reason:** a skill the model would have to pick by description alone is not predictable, so only
  a rule whose every moment a forced path covers may leave the prose. Wiring a `node --test`
  invocation happens in a workflow or a `package.json` test script and nowhere else, which the guard
  can predict.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the `node-test-discovery` skill, its body guidelines, force-loaded for
  `.github/workflows/**`, `package.json` and `*/package.json`, the files an invocation lives in.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
