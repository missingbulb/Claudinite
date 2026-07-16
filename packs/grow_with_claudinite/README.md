# grow_with_claudinite

Opt into the **growth lifecycle** — declaring this pack enrolls a repo in contributing its hard-won
lessons up to the shared Claudinite canon, and in pruning its local packs once the canon owns them.
Seeded by default (`--init` + the one-time `grow-with-claudinite-seed` baseline migration for the
existing fleet), and **opt-out by removal**: baselining never re-adds it.

The lifecycle's full narrative — the three stages, why there are no barriers between them, the
cadence, and the review gates — lives with its central stage, in the
[canon-curation pack](../canon-curation/README.md). This pack carries the **member-side** stages.

Carries **no conformance checks** — its work is three `run_daily` tasks, all ordinary, independent
planner units:

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-extract-new-instructions` ([extract.md](extract.md)) | the project changed in the window | the project's own local packs, on `main` (directly) |
| `growth-dedup-local-instructions` ([dedup.md](dedup.md)) | canon changed, or the project's local packs changed (or weekly) | a PR against the project's `main` |
| `growth-discover-packs` ([discover-packs.md](discover-packs.md)) | the member's weekly full sweep | one PR per authored pack, against Claudinite's canon |

The central stage — `growth-promote-to-claudinite`, which reads the enrolled members' local packs,
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

## Identifying a project's capture surface: its local packs (the same way in every stage)

Every growth stage operates on a project's **local packs** — the tracked packs a repo keeps under
`.claudinite/local_packs/<pack>/` (prose in `RULES.md`, checks in the pack's `rules`, activity
procedures as the pack's skills, `run_daily` tasks). That subtree **is** the project's own content;
the rest of `.claudinite/` is the **read-only mounted canon** and is never a capture, prune, or
promote target. So "a project's local packs" means precisely *everything under
`.claudinite/local_packs/`, and nothing else under `.claudinite/`*. This is the normalized capture
surface — a structural set the stages read the same way, not a `CLAUDE.md`-graph walk over stray
Markdown (a repo with no local packs yet simply has nothing to extract, dedup, or promote here; a
project adopts the structure via the `generate-project-instructions` skill).

Prefer the strongest mechanism the lesson allows — the **local promotion ladder**, applied at the
project's own level: a deterministic rule becomes a **check** in the owning pack's `rules` (its
failure message carries the lesson), an activity-scoped procedure becomes a **pack skill**, and only
what neither can carry lands as **prose** in a pack's `RULES.md`. A check relieves every session's
context completely where prose only relocates it, so capture writes *more checks and less prose*.

The stages differ only in *how they read that set*, never in *which set it is*: extract and dedup
run against the member repo and read the local packs from the working tree; promote runs centrally
and reads the same subtree over the GitHub API (get-file-contents under `.claudinite/local_packs/`).
Extract writes into it, promote reads from it, dedup prunes within it — all against the identical,
`.claudinite/local_packs/`-rooted set.
