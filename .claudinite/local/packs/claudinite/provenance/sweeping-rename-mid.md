## 2026-08-30 · born · Claudinite: growth-extract lessons (#1440)
- **Source:** the growth-extract run over the window in #1426.
- **Reason:** #1385 caught two dashboard modules independently reinventing the retired `NEEDS_HUMAN`
  label constant as a comparison key after the sweep had started - no error, no failing test, only a
  wrong count.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Sweeping a rename mid-migration across many PRs".
- **Retire when:** Retire the rule only if a drift guard pins every comparison key to its constant.
- **Landed:** #1440 (Refs #1426).

## 2026-09-01 · reworded · writing-pack-prose: the pack-prose authoring skill and the per-pack references doc (#1561)
- **Reason:** its inline issue ids moved into a `references.md` entry as this pack became the
  references convention's first caller.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1561 (Closes #1560).
