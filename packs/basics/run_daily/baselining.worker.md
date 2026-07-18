# baselining worker

Restore the repo the plan hands you to the current canonical baseline. Works entirely over the session's
**GitHub MCP tools** (`mcp__github__*`) — never a clone, and no shell GitHub access in the fleet run.

First read the member's `.claudinite-checks.json` and branch on its mount shape — the `claudinite`
stamp is the discriminator ([mount/DESIGN.md](../../../mount/DESIGN.md)):

- **Vendored member** (`"claudinite": { "updated": … }` present) — perform the **transactional
  refresh**, all of it as **one commit**:
  1. **Apply the pending migration notes** — every `migrations/active_migrations/` record in the
     canon dated **after** the member's `updated` stamp, oldest first (mechanical ops, plus
     following a note's agentic instructions where it carries them).
  2. **Converge `.claudinite/shared/`** to the canon head snapshot — the member's vendor set per
     [mount/vendor.mjs](../../../mount/vendor.mjs) (engine roots minus tests and root docs, the
     packs/skills machinery, the declared packs with their `requires` closure, their skills
     union, the corpus index), written copy-if-different **and** deleting files in `shared/` the
     set no longer contains. Unconditional: a member-side edit to a vendored file reverts here,
     visibly in the diff. Never touch `.claudinite/local_packs/` or anything outside `shared/`
     except what a note names.
  3. **Advance the stamp** — `{ "updated": "<today>", "ref": "<canon head sha>" }`.
  If any part fails, **write nothing** — the member keeps running its old snapshot coherently,
  tonight's failure goes to the routine's failure log, and the next night retries from the same
  stamp. Also keep the fresh-path wiring converged per [bootstrap.md](../../../bootstrap.md)
  (hook registrations, the `@.claudinite/shared/CLAUDE.md` import, the CI stub copy) — additive
  and in-place fixes only, never clobbering the member's own entries.
- **Pre-flip member** (no stamp) — apply **only** the legacy maintenance in bootstrap.md's
  [transition appendix](../../../bootstrap.md#appendix--pre-flip-members-transition-window-retiring):
  refresh the tracked sync hook from the canon, keep the legacy wiring/gitignore/declaration
  backfills converged. **Never convert a member to the vendored mount here** — conversion is the
  gated flip note (phase 2), piloted before it widens; an ungated flip from this worker would
  bypass that gate.
- **Adopt a queued repo** (a repo with an open `Adopt <owner>/<repo>` issue — the census applied
  every eligibility rule) — run the fresh-path bootstrap (which vendors the mount); it's a
  **first** adoption, so **do open** its enrollment issue, noting the owner-in-the-loop parts
  skipped unattended (adoption interview, project classification, cloud env setup) and anything
  the API couldn't do. A queued repo you can't reach stays queued — the issue is the owner's cue
  to grant access; log it and move on.

Then, for a covered member (either shape):

- **Align** — evaluate the repo against its declared packs' *current* checks (the same engine its Stop
  hook and CI run). Apply a failing check's own `fix` remedy, **never more**; a finding needing
  judgment becomes an issue in the member repo, not an edit.
- **Enrollment issue** — being reached proves enrollment: close a still-open one (title
  `Enroll <PROJECT_NAME> in Claudinite fleet maintenance`, found by title) as `completed`.

**Delivery** — member-side changes go per `maintenance.delivery` in the member's `.claudinite-checks.json`
(always explicit; a missing key is drift — materialize `{ "maintenance": { "delivery": "push" } }`):
`push` commits to the default branch; `pr` amends the stable `claudinite/maintenance` branch and its
one open PR (never merged); an unrecognized value commits nothing and opens an issue there naming it.
Adoption necessarily precedes the flag — a first bootstrap lands as a direct commit. A vendored
member's refresh is **one commit** regardless of delivery mode — notes + converge + stamp never split.

Never touch the home (sheepdog) repo; never adopt without an open adoption issue; never flip a
pre-flip member; never let alignment edit beyond a failing check's own remedy; never merge a
delivery PR or guess a delivery preference. `smarts: medium` — the bootstrap and alignment merge
into existing `CLAUDE.md` / `settings.json` without clobbering, which is judgment.
