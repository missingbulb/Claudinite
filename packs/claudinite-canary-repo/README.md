<img src="badge.svg" width="24" height="24" alt=""> claudinite-canary-repo

The canon's live proof that it can deliver a file into a member's `.github/workflows/`.

## Why it exists

The nightly update commits with the Action's `GITHUB_TOKEN`, which GitHub refuses under
`.github/workflows/`, and the refusal rejects the **whole ref** rather than the one file. The pack
update flow answers that with the **withhold lane**: every write bound for that directory is
diverted to `.claudinite/pending-workflows/`, a path the Action token can push. It rides the
maintenance PR as an ordinary added file and the update ends at `apply-stage` until a session
holding an MCP credential moves it into place. This pack is the probe that exercises that route
end to end against a real member.

## What it ships

| | |
|---|---|
| [`stubs/workflows/claudinite-workflow-probe.yml`](stubs/workflows/claudinite-workflow-probe.yml) | one inert workflow — `workflow_dispatch` only, no schedule, no push |
| `seedOps` | seeds that file at **adoption**, written by the install flow and committed by the adopting session |
| [`migrations/2026-08-14-workflow-probe-current/`](migrations/2026-08-14-workflow-probe-current/migration.mjs) | from pack version 2 on, re-vendors the same path through the withhold lane |

The two routes are the point, and their order is the point. Seeding is the easy half — the
adopting session holds a credential the Action token does not, so nothing is being tested there.
The record is the hard half, and because the file is already present by then, it has to *update* a
workflow rather than create one — the exact shape a fleet-wide workflow fix would take.

## Who carries it

`seededByDefault: false`, `detect: null`, `marker: null`. `--init` never seeds it, the fleet's
pack scan never suspects it, and a repo carries it only because someone declared it by hand. The
intended holder is **the canary** and nothing else.

## Reading the result

The workflow's one step echoes a **revision marker**. "The file exists" stops being an assertion
once the file has existed since adoption, so a delivery is watched by bumping that line in the
template here and checking the member's copy against it. Current marker: **revision 2**.

A member whose copy reads `revision 2` was reached by the *record*, through the withhold lane —
staged into `.claudinite/pending-workflows/`, carried in a maintenance PR, and moved into
`.github/workflows/` by a session with a credential the Action token does not have. `revision 1`
means the seed landed and the record has not run yet.
