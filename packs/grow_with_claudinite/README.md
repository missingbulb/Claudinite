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
| `growth-pack-gap-scan` (independent) | the weekly full sweep | a converged "Pack gaps" issue in the project's own repo |

`promote` (`growth:2`, central, once) reads every participating repo's local docs, generalizes the
portable lessons, and opens a PR against Claudinite's canon.

The **pack-gap scan** is the odd one out — independent of the extract → promote → dedup barrier. It asks
an agent a leading question (which technologies this repo uses that no pack, stub included, covers) and
converges a tracking issue, so a technology with no pack home stops being invisible. It edits nothing;
minting a pack for a surfaced gap is promote's job. Worker: [../../growth/pack-gap-scan.md](../../growth/pack-gap-scan.md).
