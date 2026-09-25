## 2026-09-06 · born · Make a blocking action check date itself (#1787)
- **Reason:** an action check is re-judged over the whole transcript at Stop, so a blocking one
  landing mid-session convicts calls made before it existed and no edit can clear them. Blocking,
  and it carries its own `since` so a member holding an undated check reads the rule before it
  blocks.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check declared-check-since, in packs/basics/worldRules/declared-check-since.mjs.
- **Landed:** #1787 · pack version 60906.4.
