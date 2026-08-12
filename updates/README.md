# `updates/` — the flows that move a repo between versions

Canon-internal machinery (never vendored, like [`vendoring/`](../vendoring/README.md)): one runner
per **flow**, each moving a repo from the versions it has installed to the ones this canon tree
ships. The design — why the corpus splits into a versioned engine and versioned packs, and what
each flow may and may not do — is [`docs/versioned-updates/DESIGN.md`](../docs/versioned-updates/DESIGN.md);
the release discipline the engine's versions follow is [`engine/RELEASES.md`](../engine/RELEASES.md).

| File | Flow |
|---|---|
| [`engine-update.mjs`](engine-update.mjs) | The **engine update**: replace the mount's engine wholesale, run the engine migrations in the repo's gap, converge the non-workflow wiring, stamp the new version, and gate the merge on the converged tree's own `selftest --strict`. Deterministic end to end — no agentic stage, and no lane to add one. |
| [`pack-update.mjs`](pack-update.mjs) | The **pack update**: the same shape, per declared pack — replace the pack's tree, run its records, stamp its version, same gate. It enforces `minEngineVersion` against the version the TARGET runs, it may write `.github/workflows/` (which the engine flow may not), and it ends by saying whether the agentic apply stage is needed. |
| [`install.mjs`](install.mjs) | The **install**: the pack flow started from version zero, **running no migrations** — the vendored content is already the newest shape, and a record assumes the shapes its own era produced, which an empty repo is not. It stamps the latest version directly, and refuses a pack the repo already has a version for. |
| [`terminals.mjs`](terminals.mjs) | The **uniform terminal**: what happens to an update's PR, given what a flow returned. One function for every flow, so no shell re-decides it. |
| [`served-by.mjs`](served-by.mjs) | The **skew guard**: which mechanism serves a repo while baselining and these flows both exist. Exactly one, per repo, flipped by the update that migrates it — and a repo that says nothing keeps doing what it does today. |

## The custom update — the one named lane out of the engine flow

The engine flow cannot write `.github/workflows/`: the Action's `GITHUB_TOKEN` may
not push there, and GitHub refuses the **whole ref**, so a workflow file left in the
commit fails the entire update and everything riding it. Ordinary workflow churn is
therefore the pack flow's (owner decision 2) — the scheduler workflow's content is a
function of the task set, so pack changes are what rewrite it.

That leaves one residue: the rare **engine** change that must touch a workflow file
anyway. It ships as a **custom update** — an explicitly named, separately credentialed
operation, run by an MCP-credentialed session or a human, never by the engine flow:

1. The engine release lands normally, *without* the workflow change.
2. The custom update is named in that release's `engine/RELEASES.md` row — which repos
   it must reach, and what it does to each.
3. It runs under a credential that can write workflows, one repo at a time, and the
   row is updated when the fleet is through.

**Naming it is the point.** The lane exists so that "the engine needed a workflow
change" is a visible, credentialed operation with a written trail, rather than an
invisible agentic side door that quietly grows into a general escape hatch. It is for
**workflow files only** — never for a contract change that could not be expressed
mechanically. Those keep backward compatibility or wait (DESIGN §2.3), and the
pressure to route one through here is exactly what the name makes reviewable.

A runner here **judges everything before it writes anything**: a refused update leaves the repo
running exactly what it was running, which is the same transactional contract the vendor writer
keeps. Where it cannot proceed it returns a `needs-human` outcome naming what a person has to do —
it never half-applies, and it never quietly skips the step it could not take.

These run **from a canon checkout against a target repo**, like vendoring: updating is done *on* a
project, never *by* it.
