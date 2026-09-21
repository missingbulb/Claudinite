## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** three worked implementations in the owner's fleet - GoogleCalendarEventCreator (the
  origin: extension/jsdom rendering, pixel-exact snapshots), TLDR (the cross-tier `server` kind) and
  ShoutsAndWhispers (the Flutter port: golden-file rendering, the fake-world harness and the first
  `saga` implementation).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** two `RULES.md` sections - the determinism rules, and the per-stack rendering
  recipes.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · from `RULES.md` into a path-forced skill (#1667)
- **Source:** the audit of every pack's `RULES.md` for rules that only matter while editing a
  nameable file class (#1662).
- **Reason:** the owner's bar, set mid-review, is that a rule leaves `RULES.md` for a skill only
  where that skill's forced paths cover every moment the rule is needed - a skill the model must
  pick by description alone is not predictable. Determinism and the per-stack recipes are needed
  while writing a case, the render harness or the fake world, and nowhere else.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the `deterministic-expecteds` skill, forced for `dev/requirements/**/cases/**` and
  `dev/requirements/shared/**`, so the guard holds an edit there until the session has loaded it.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
