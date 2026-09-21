## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** SAM's esbuild builder runs a production-only `npm install` in its scratch directory,
  so a `devDependency` esbuild is skipped and the build fails with "Cannot find esbuild". Declaring
  esbuild in `dependencies` does not bloat the deployed artifact - it is not bundled unless the
  handler imports it - so the usual objection to the remedy, shipping a build tool to production,
  does not apply.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, beside the check that carries its mechanical half.
- **Retire when:** reaffirm against SAM's esbuild builder; retire if it stops running a
  production-only install.
- **Landed:** #128 (Closes #127, Closes #131) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the sweep cut from every rule in the corpus the consequence prose arguing for a rule
  rather than enabling it, leaving each as trigger, instruction, and at most one clause of why. This
  pack went from 984 words to 885.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-07-29 · reaffirmed · prose-to-checks: add the deletion test and sweep the canon with it (#552)
- **Reason:** kept against the deletion test: the check deliberately declines multi-package repos
  and the prose still carries the rule there, so deleting it would drop the rule for exactly the
  repos the check skips.
- **Actor:** @missingbulb (owner).
- **Landed:** #552 (Closes #551) · pack version 1.

## 2026-09-01 · reaffirmed · Recover the rationale #467 cut from the shared packs into references.md (#1575)
- **Reason:** #467 cut these clauses as consequence prose before the pack had anywhere to keep them.
  Recovering them does not undo that decision - every rule line stays exactly as #467 left it, and
  only clauses carrying a failure mode, cost, frequency or authority, something a review can weigh,
  were taken back.
- **Actor:** @missingbulb (owner).
- **Landed:** #1575 (Closes #1571) · pack version 60901.2.

## 2026-09-05 · moved · Rules to skills: the audit's path-forced extractions (#1667)
- **Reason:** a rule leaves RULES.md for a skill only where that skill's
  `force-load-on-file-edits-paths` covers every moment the rule is needed; a skill the model would
  have to pick by description alone is not predictable. These rules are all predicted by an edit of
  the template or the package manifest, so they move, while the deploy-time failures, which no file
  edit predicts, stay in the prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** from RULES.md into the sam-build-and-deps skill, forced for `package.json` and the
  template.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
