## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Source:** phases 2 to 5 of the four-moment declared-checks design, bounded to the three packs
  every session in this repo loads.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check git-pull-on-shallow-clone, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).

## 2026-09-06 · severity-changed · Date the three action checks added today so they do not convict the past (#1773)
- **Reason:** an action check is re-judged over the whole session transcript at Stop, so a blocking
  one with no creation date convicts calls made before it existed in the session's tree - and an
  action finding has no clearing move, so it blocks every Stop for the rest of that session. It
  happened within the hour these three landed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `since: 2026-09-06`, which `applyGrace` reads as advisory for the grace window.
- **Landed:** #1773 (Closes #1772).
