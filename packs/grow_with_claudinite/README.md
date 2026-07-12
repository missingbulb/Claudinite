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
| `growth-stack-manifest` (independent) | the weekly full sweep | a converged "Stack manifest" issue in the project's own repo |

`promote` (`growth:2`, central, once) reads every participating repo's local docs, generalizes the
portable lessons, and opens a PR against Claudinite's canon.

The **stack-manifest scan** is the odd one out — independent of the extract → promote → dedup barrier,
and **stage 1 of pack discovery**. It asks an agent a leading question — this repo's technologies, the
APIs it integrates, and its deployment/distribution targets — and converges a manifest into a tracking
issue. It **decides nothing about packs**: whether a surfaced technology warrants a pack is stage 2's
separate, central call, which reads these manifests across the fleet. Worker:
[../../growth/stack-manifest.md](../../growth/stack-manifest.md).
