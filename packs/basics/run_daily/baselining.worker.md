# baselining worker

Restore the repo the plan hands you to the current canonical baseline. Works entirely over the GitHub
API tooling (never a clone). Two shapes, same operation (the idempotent bootstrap):

- **Baseline a covered member** — re-run the idempotent bootstrap ([../../../bootstrap.md](../../../bootstrap.md))
  to refresh the mount and the wiring it owns. Most days nothing drifted → commit nothing. A pack
  declaration missing `basics` is drift — the bootstrap's backfill step materializes the explicit
  `"basics"` entry.
- **Adopt a queued repo** (a repo with an open `Adopt <owner>/<repo>` issue — the census applied every
  eligibility rule) — run the same bootstrap; it's a **first** adoption, so **do open** its Part 4
  enrollment issue, noting the owner-in-the-loop parts skipped unattended (project classification,
  cloud env setup) and anything the API couldn't do. A queued repo you can't reach stays queued — the
  issue is the owner's cue to grant access; log it and move on.

Then, for a covered member:

- **Baseline migrations** — land each declared migration's consumer-side legacy→canonical rename over
  the API (see [migrations/README.md](../../../migrations/README.md)); the census confirms fleet-wide
  completion and retires the record.
- **Align** — evaluate the repo against its declared packs' *current* checks (the same engine its Stop
  hook and CI run). Apply a failing check's own `fix` remedy, **never more**; a finding needing
  judgment becomes an issue in the member repo, not an edit.
- **Enrollment issue** — being reached proves enrollment: close a still-open one (title
  `Enroll <PROJECT_NAME> in Claudinite fleet maintenance`, found by title) as `completed`.

**Delivery** — member-side changes go per `maintenance.delivery` in the member's `.claudinite-checks.json`
(always explicit; a missing key is drift — materialize `{ "maintenance": { "delivery": "push" } }`):
`push` commits to the default branch; `pr` amends the stable `claudinite/maintenance` branch and its
one open PR (never merged); an unrecognized value commits nothing and opens an issue there naming it.
Adoption necessarily precedes the flag — a first bootstrap lands as a direct commit.

Never touch the home (sheepdog) repo; never adopt without an open adoption issue; never let alignment
edit beyond a failing check's own remedy; never merge a delivery PR or guess a delivery preference.
`smarts: medium` — the bootstrap and alignment merge into existing `CLAUDE.md` / `settings.json`
without clobbering, which is judgment.
