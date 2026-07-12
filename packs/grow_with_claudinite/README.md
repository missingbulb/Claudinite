# grow_with_claudinite

Opt into the **growth lifecycle** — declaring this pack enrolls a repo in contributing its hard-won
lessons up to the shared Claudinite canon. Seeded by default (`--init` + the one-time
`grow-with-claudinite-seed` baseline migration for the existing fleet), and **opt-out by removal**:
baselining never re-adds it.

Carries **no conformance checks** — its work is three `run_daily` tasks, plus the central `promote` step
the orchestrator runs once (see [../../growth/README.md](../../growth/README.md)):

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-extract-new-instructions` (`growth:1`) | the project changed in the window | the project's own `main` (directly) |
| `growth-dedup-local-instructions` (`growth:3`) | canon changed, or the project's docs changed (or weekly) | a PR against the project's `main` |
| `growth-discover-packs` (independent) | the member's weekly full sweep | one PR per authored pack, against Claudinite's canon |

`promote` (`growth:2`, central, once) reads every participating repo's local docs, generalizes the
portable lessons, and opens a PR against Claudinite's canon.

**Pack discovery** (`growth-discover-packs`, [../../growth/discover-packs.md](../../growth/discover-packs.md))
is an ordinary `run_daily` task — the planner picks it up per member on its weekly full sweep, no
bespoke central step. For the member it's handed it runs the whole pipeline: manifest the stack, suggest
a pack for each technology no pack yet owns (on first sight), populate it with rules and checks distilled
from that member's real usage, and open one canon PR per pack. Like every worker it **executes
centrally** (home session, fleet token) — that's how it writes the canon — but it's scheduled the
regular way; over a week the staggered full sweep covers the fleet, and the shelf + open-PR check keeps
first sight from double-authoring.
