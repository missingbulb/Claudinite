## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Source:** phases 2 to 5 of the four-moment declared-checks design, bounded to the three packs
  every session in this repo loads.
- **Reason:** the rules these operation skills carry had a trigger all along, so they leave
  `RULES.md` by the deletion test and load at the moment the call is made.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill forced by `force-load-on-tool-calls` on a `node --test` command.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).

## 2026-09-06 · reworded · Rule revalidation: re-probe five harness claims at their live addresses (#1782)
- **Reason:** `node --test <dir>` fails outright with `Cannot find module`, so it is the bash glob
  alone that leaves you believing a green run over a subset.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1782 (Refs #1767).

## 2026-09-17 · reworded · Claudinite growth: extract lessons (#2110)
- **Source:** the growth-extract run over the 2026-09-17 window.
- **Reason:** the same run: nothing in the path of a pack's `RULES.md` points at `engine-tests/`, so
  this is the covering test a "run what the edit touches" heuristic cannot find.
- **Actor:** @missingbulb (owner).
- **Landed:** #2110 (advances #2104).

## 2026-09-20 · reworded · Claudinite growth: rule revalidation (#2161)
- **Source:** the weekly revalidation's re-probe of this pack's environment claims.
- **Reason:** re-measured: the tree carries 314 tracked test files, and node v22 globs its own path
  arguments, so a root-level glob now exits 1 rather than passing silently. The silent shape is the
  glob that matches a subset - 125 of 314 - and that is what the rule now names.
- **Actor:** @missingbulb (owner).
- **Landed:** #2161 (Refs #2150).
