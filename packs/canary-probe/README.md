<img src="badge.svg" width="24" height="24" alt=""> canary-probe

The canon's live proof that it can deliver a file into a member's `.github/workflows/`.

## Why it exists

`.github/workflows/` is the one directory the nightly update can never push to. The update
commits with the Action's `GITHUB_TOKEN`, GitHub refuses that token under that path, and the
refusal rejects the **whole ref** — so a single workflow write does not fail one file, it fails
the entire converge and everything riding it. #649 is that problem.

The answer is the **withhold lane** in [`updates/pack-update.mjs`](../../updates/pack-update.mjs):
every write bound for `.github/workflows/` is diverted to `.claudinite/pending-workflows/`, a path
the Action token *can* push. It rides the maintenance PR as an ordinary added file — reviewable in
the diff, recoverable if nothing else runs — and the update ends at `apply-stage` until a session
holding an MCP credential moves it into place.

That lane shipped with **one** exercised caller: the scheduler workflow's own convergence. A
record's `materialize` goes through the same `write`, and had never run against a live member —
the residual #649 was reopened for, and the last item left on #768. Proving it needs a record that
materializes a workflow into a repo that really runs the update flow, and nothing in the corpus
was one. This pack is that.

## What it ships

| | |
|---|---|
| [`stubs/workflows/claudinite-workflow-probe.yml`](stubs/workflows/claudinite-workflow-probe.yml) | one inert workflow — `workflow_dispatch` only, no schedule, no push |
| `seedOps` | seeds that file at **adoption**, written by the install flow and committed by the adopting session |
| a record, from pack version 2 on | re-vendors the same path on later cycles, through the withhold lane |

The two routes are the point, and their order is the point. Seeding is the easy half — the
adopting session holds a credential the Action token does not, so nothing is being tested there.
The record is the hard half, and because the file is already present by then, it has to *update* a
workflow rather than create one — the exact shape a fleet-wide workflow fix would take.

## Who carries it

`seededByDefault: false`, `detect: null`, `marker: null`. `--init` never seeds it, the fleet's
pack scan never suspects it, and a repo carries it only because someone declared it by hand. The
intended holder is **the canary** and nothing else: a probe belongs on the repo that exists to be
converged against candidate refs and is disposable by construction.

## Reading the result

The workflow's one step echoes a **revision marker**. "The file exists" stops being an assertion
once the file has existed since adoption, so a delivery is watched by bumping that line in the
template here and checking the member's copy against it. Current marker: **revision 1**.
