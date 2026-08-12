# `updates/` — the flows that move a repo between versions

Canon-internal machinery (never vendored, like [`vendoring/`](../vendoring/README.md)): one runner
per **flow**, each moving a repo from the versions it has installed to the ones this canon tree
ships. The design — why the corpus splits into a versioned engine and versioned packs, and what
each flow may and may not do — is [`docs/versioned-updates/DESIGN.md`](../docs/versioned-updates/DESIGN.md);
the release discipline the engine's versions follow is [`engine/RELEASES.md`](../engine/RELEASES.md).

| File | Flow |
|---|---|
| [`engine-update.mjs`](engine-update.mjs) | The **engine update**: replace the mount's engine wholesale, run the engine migrations in the repo's gap, converge the non-workflow wiring, stamp the new version. Deterministic end to end — no agentic stage, and no lane to add one. |

A runner here **judges everything before it writes anything**: a refused update leaves the repo
running exactly what it was running, which is the same transactional contract the vendor writer
keeps. Where it cannot proceed it returns a `needs-human` outcome naming what a person has to do —
it never half-applies, and it never quietly skips the step it could not take.

These run **from a canon checkout against a target repo**, like vendoring: updating is done *on* a
project, never *by* it.
