## 2026-07-29 · born · prose-to-checks: the home declares every seededByDefault pack (home-seeded-packs-declared) (#540)
- **Reason:** the prose named its own drift guard as future work and the precondition it set held -
  all three seeded packs were already declared, so the check shipped at zero findings.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** check home-seeded-packs-declared, in
  .claudinite/local/packs/claudinite/home-seeded-packs-declared.mjs.
- **Rejected:** a `git grep seededByDefault`, which also hits the prose about seeding and the engine
  code that reads the flag; the rule parses the home's own `packs/*/pack.mjs` with comments blanked
  out instead.
- **Retire when:** Retire the check only if baselining stops skipping the home.
- **Landed:** #540 (Refs #534).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
