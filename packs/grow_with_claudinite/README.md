# grow_with_claudinite

Opt into the **growth lifecycle** — declaring this pack enrolls a repo in contributing its hard-won
lessons up to the shared Claudinite canon. Seeded by default (`--init` + the one-time
`grow-with-claudinite-seed` baseline migration for the existing fleet), and **opt-out by removal**:
baselining never re-adds it.

Carries **no conformance checks** — its work is two `run_daily` tasks, plus two central steps the
orchestrator runs (see [../../growth/README.md](../../growth/README.md)):

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-extract-new-instructions` (`growth:1`) | the project changed in the window | the project's own `main` (directly) |
| `growth-dedup-local-instructions` (`growth:3`) | canon changed, or the project's docs changed (or weekly) | a PR against the project's `main` |

`promote` (`growth:2`, central, once) reads every participating repo's local docs, generalizes the
portable lessons, and opens a PR against Claudinite's canon.

**Pack discovery** ([../../growth/discover-packs.md](../../growth/discover-packs.md)) is the other
central step — a single **weekly** process, like `promote` orchestrator-dispatched (not a per-repo
`run_daily` task). It runs the whole pipeline: manifest each repo's stack, suggest a pack for each
technology no pack yet owns (on first sight), populate it with rules and checks distilled from the repos
that actually use it, and open one PR per authored pack.
