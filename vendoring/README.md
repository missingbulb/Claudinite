# `vendoring/` — how the corpus ships into consumers

Canon-internal machinery (never itself vendored, #385): compute a consumer's **vendor set**
from its pack declaration and converge the consumer's tracked `.claudinite/shared/` to it.
The decision record — why a tracked vendored mount, its phases, the anti-rewind guards —
is [DESIGN.md](DESIGN.md); the adoption procedure that first runs this machinery is
[bootstrap.md](../bootstrap.md).

| File | Role |
|---|---|
| [`compute-vendor-set.mjs`](compute-vendor-set.mjs) | The **vendor-set computation**: a repo's pack declaration → the corpus file set that repo persists under `.claudinite/shared/` (the `engine/` root minus tests and root docs, plus the declared packs with their `requires` closure — each pack's bundled skills riding its own tree). Verified import-closed before it is returned. |
| [`apply-vendor-set.mjs`](apply-vendor-set.mjs) | The **vendor writer**: whole-set convergence of a target's `.claudinite/shared/` plus the provenance stamp (`claudinite.updated` / `claudinite.ref`), erroring **before any write** — with the #328 anti-rewind guards (a passed `--ref` must equal the canon checkout's HEAD; the target's prior stamped ref must be an ancestor). |

Both run **from the canon tree** (a checkout or a fetched snapshot) *against* a consumer
checkout — vendoring is done *on* a project, never *by* it. The regular updater is the
nightly baselining worker performing the equivalent writes over MCP; adoption and an
on-demand refresh run these directly.

The session-start orchestration the vendored files provide lives in
[`engine/hooks/`](../engine/hooks/) (the wired `*-command` entry points) and
[`engine/pack_loader/`](../engine/pack_loader/) — see those folders. The legacy
fetch-at-session-start mount (the tracked `sync-claudinite.sh` hook) retired with
phase 3 ([DESIGN.md](DESIGN.md)); every member runs from its committed snapshot.
