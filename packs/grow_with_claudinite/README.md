# grow_with_claudinite

Opt into the **growth lifecycle** — declaring this pack enrolls a repo in contributing its hard-won
lessons up to the shared Claudinite canon, and in pruning its local docs once the canon owns them.
Seeded by default (`--init` + the one-time `grow-with-claudinite-seed` baseline migration for the
existing fleet), and **opt-out by removal**: baselining never re-adds it.

The lifecycle's full narrative — the three stages, why there are no barriers between them, the
cadence, and the review gates — lives with its central stage, in the
[canon-curation pack](../canon-curation/README.md). This pack carries the **member-side** stages.

Carries **no conformance checks** — its work is three `run_daily` tasks, all ordinary, independent
planner units:

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-extract-new-instructions` ([extract.md](extract.md)) | the project changed in the window | the project's own `main` (directly) |
| `growth-dedup-local-instructions` ([dedup.md](dedup.md)) | canon changed, or the project's docs changed (or weekly) | a PR against the project's `main` |
| `growth-discover-packs` ([discover-packs.md](discover-packs.md)) | the member's weekly full sweep | one PR per authored pack, against Claudinite's canon |

The central stage — `growth-promote-to-claudinite`, which reads the enrolled members' local docs,
generalizes the portable lessons, and opens a PR against Claudinite's canon — is **not** this
pack's: it rides [canon-curation](../canon-curation/README.md), declared only by the canon home
repo, and its gate targets exactly the members that declare *this* pack.

**Pack discovery** ([discover-packs.md](discover-packs.md)) is an ordinary `run_daily` task — the
planner picks it up per member on its weekly full sweep. For the member it's handed it runs the
whole pipeline: manifest the stack, suggest a pack for each technology no pack yet owns (on first
sight), populate it with rules and checks distilled from that member's real usage, and open one
canon PR per pack. Like every worker it **executes centrally** (home session, fleet token) — that's
how it writes the canon — but it's scheduled the regular way; over a week the staggered full sweep
covers the fleet, and the shelf + open-PR check keeps first sight from double-authoring.

## Identifying a project's local docs (the same way in every stage)

Every growth stage operates on a project's **local instruction docs**, and all of them identify
that set the **same way**: by following the import/pointer graph out from the repo's **root
`CLAUDE.md`** — the very graph the agent itself loads — and treating everything under the mounted
canon at `.claudinite/` as **read-only canon, not local docs**. So "a project's local docs" means
precisely *the project's own docs reachable from its `CLAUDE.md`, minus the canon it mounts*. Don't
scan the whole tree for stray Markdown; the `CLAUDE.md` graph is the authoritative set, and a doc
no `CLAUDE.md` path reaches isn't part of the project's instructions.

The stages only differ in *how they read that set*, never in *which set it is*: extract and dedup
run against the member repo and read it from the working tree; promote runs centrally and walks the
same graph over the GitHub API (get-file-contents from `CLAUDE.md` outward). Extract writes into
it, promote reads from it, dedup prunes within it — all against the identical,
`CLAUDE.md`-anchored corpus.
