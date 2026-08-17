# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`).

It contributes the pieces only a fleet enforcer needs — the **cross-repo sweeps** — plus their
config schema and the scheduled tasks that run them. The rest of the machinery — running the
daily-run (the orchestrator), the task engine (`engine/scheduler/`), scheduling — is Claudinite
**core**, because the update task and the daily-run are Claudinite's own responsibility, not
the pack's.

**Six tasks** — separate, because they close on unrelated conditions. The **roster sweep**
([check-fleet-roster.mjs](tasks/fleet-roster/check-fleet-roster.mjs)) walks the fleet once and
answers two questions from that one walk: *is this repo a member*, converging `fleet-adoption`
issues ([adoption-issues.mjs](tasks/fleet-roster/adoption-issues.mjs)), and *is that membership
still meaning anything*, converging `fleet-drift` issues
([drift-issues.mjs](tasks/fleet-roster/drift-issues.mjs)). The second question exists because
per-project scheduling made every member maintain itself and removed the last outside look at one:
self-maintenance cannot detect its own absence. They share a walk rather than a task each because
each used to re-derive the other's classification and the two could disagree
([#788](https://github.com/missingbulb/Claudinite/issues/788)); what stays separate is the two
**issue families**, never the enumeration. The **missing-packs task**
([fleet-add-missing-packs](tasks/fleet-add-missing-packs/task.md)) asks whether a member's declared pack
set still *matches the repo* — by fingerprint on its weekly scan
([scan-for-needed-packs.mjs](tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs)), or from what the
owner named on a forced run ([force-add-packs.mjs](tasks/fleet-add-missing-packs/force-add-packs.mjs)) —
and, per member with work, converges an `add-packs` work-list issue **in that member** and fires that
member's own scheduler at its adopt-requested-packs task (grow_with_claudinite): the fan-out model
([#749](https://github.com/missingbulb/Claudinite/issues/749)) — the enforcer dispatches, the member
executes. It exists because a pack's `detect`
fingerprint is consulted exactly once, at bootstrap's `--init`: the update flows backfill the seeded packs
and each declared pack's `requires` closure but never re-fingerprints, so a member that grows into a
pack after adoption is never told the pack exists. The **usage sweep**
([aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs)) asks *what does the fleet
actually use* and writes `usage-fleet.GENERATED.json` — a file, not issues, because it reports a
measurement rather than a condition to converge. It exists because a member folds its own skill-usage
numbers and can therefore only say whether a skill loads *there*; whether a skill earns its place at
all is fleet-shaped, and nothing inside a member can see it. The **pack-seed sweep**
([check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs)) asks *does each member
declare what this fleet standardizes on* and **adds the declaration** where it is missing. It exists
because some packs need a parameter no member can derive — the answer is a fact about the fleet, and canon
cannot supply it either, since a bootstrap run does not know which fleet it is bootstrapping into. Only
this repo knows: it is the fleet.

**The pack-seed sweep is the one that writes to members**, and it stays narrow on purpose: one pack
declaration from this repo's `packSeeds` list, one PUT to the member's default branch guarded by the blob
sha the read returned, idempotent, no issue in either direction. Three rules keep it safe. It **names no
pack** — every id comes from the config, so the enforcer never becomes a second place packs are known. It
**gates on the member's own mount**: a declared pack whose code is absent is a blocking `config` error
there, and a member's mount carries only what it declared as of its last converge, so the sweep writes
only where the pack is already on disk — `not-vendored` is a wait, not a finding, and members converge
nightly, so the rollout needs no coordination. And it **seeds, never overrides**: a member that already
declares the pack, or already carries a config for it, keeps both — the fleet's list is a floor, and a
choice a repo made is a decision the sweep cannot second-guess. A dormant member is never written to.

Because it seeds and never overrides, **a wrong seed reaches each member exactly once and then sticks**
— correcting it here un-writes nothing, so it has to be right before the sweep runs. This repo states
a seeded pack's config in **two** places: the `packSeeds` entry the fleet is given, and its own entry
for that pack, which is what a session *here* runs. For every seeded pack this repo also declares,
those two must carry the **same** config — nothing compares them at seed time, and a member has no way
to know what the enforcer kept for itself. Agreement is **exact**, because nothing here may know one
pack's defaults: spell a default out on both sides rather than leaving one implicit. A pack the fleet
standardizes on but this repo does not itself run has nothing to agree with.

A pack arriving with canon reaches the fleet that already exists through a **baseline migration** instead
(a `declarePacks` op, applied by each member's own update run in the same transactional commit that
vendors the pack's code). This sweep is the **standing** half: a migration record is dated and retires,
while the sweep keeps converging every member the fleet acquires after it is gone.

The **digest** ([fleet-digest](tasks/fleet-digest/task.md)) asks *what did the fleet accomplish
yesterday, and what has it let go quiet* and writes `digests/<date>.md` — a dated plain-text
brief, one file a morning. It is the only output here addressed to a **person** rather than to the
machinery, and the only task that runs an agent in this repo. The split is the point:
[collect-fleet-day.mjs](tasks/fleet-digest/collect-fleet-day.mjs) ranks the day's merged pull
requests and closed issues **by size**, which is arithmetic, and hands over a shortlist half again
longer than the brief needs; the agent reads only that shortlist and picks the ones that were
accomplishments, which is a reading of the text. On a day the fleet merged nothing the prework
writes the brief itself and requests no agent — the dated series is what makes a **missing** brief
legible as a fault rather than as a slow Tuesday, but "nothing happened" needs no model. It moved
here from the enforcer's own local pack
([#954](https://github.com/missingbulb/Claudinite/issues/954)); what made it portable is that the
task ends at a written file, so it carries no address, no recipient and no transport.

**When this repo reads the fleet, filter the machinery out of *every* stream it reads.** Anything
here that ranks fleet activity is reading a fleet whose busiest actor is Claudinite itself, and the
machine's own artifacts do not merely appear in a size-or-discussion ranking — **they win it**. A
dispatch issue collects a comment per executor stage, so it outweighs the work it dispatched.
Exclude them on **each** axis you collect, never just the first one you thought of: a guard written
for pull requests while issues go through unfiltered leaves the whole hole open. Recognize a machine
artifact with the engine's own predicate (`isDispatchTitle`), never a private regex — the
dispatch-title format is the scheduler's to change. Filter where the maintenance total is
**tallied**, not inside the fetch: an issue the machinery filed and closed is still a true account
of how much of the day the fleet spent servicing itself.

**A brief is plain text despite its `.md` name.** It is not read on GitHub — it is *sent*,
verbatim, through a notification renderer that parses no markdown and collapses every line break, so
a brief written in markdown reaches the owner as its own source code in one running paragraph. Each
item opens with `• `, a separator that survives the collapse, and carries its URL bare, which the
renderer autolinks. The `digest-plain-text` check holds the landed series to it. The series' own
`README.md` is documentation *about* the briefs, is read on GitHub, and is markdown on purpose.

**A digest test fixture is dated in the 1990s, never the 2000s.** The enforcer writes a new
`digests/<date>.md` every morning, so a fixture dated in the range the fleet actually runs in shares
a namespace with real artifacts — it breaks when a brief is deleted, and passes for the wrong
reason when one happens to exist. `dated-fixture-collision` is blocking on the second half: a test
that has quietly stopped testing its subject and started testing repo state is the kind of green
that hides a regression. A year the fleet will never have briefs for cannot collide in either
direction.

**One manual lever, riding the same task machinery** — [force-fleet-baseline.mjs](tasks/fleet-baseline/force-fleet-baseline.mjs)
fires every covered member's own `claudinite-scheduler.yml` with `overrides: FORCE_TASKS=update`,
which is the same button the owner would press in that repo's Actions tab, pressed across the fleet in
one run. It is a **dispatcher, not a maintainer**: each member converges its own mount, with its own
token, under its own delivery policy, and this writes nothing to any member — one queued Actions run
each, and no commit, issue or comment. Under per-project scheduling the fleet needs no push in the
ordinary case; this is for the un-ordinary ones — a canon change the fleet should pick up *now*, or the
tail of members whose next slot is hours away while someone is standing by. A forced run bypasses
the update task's precondition, so a member with nothing to do converges to a cheap no-op: over-using it is
wasteful, never unsafe. A **dormant** member is skipped and reported (it stopped its own scheduler on
purpose); `include_dormant` overrides that. Canon is skipped — its own update self-skips — but the
enforcer repo is **not**: it is an ordinary member, and leaving it out would make the one repo the owner
is watching the one repo that did not move.

**The pack ships no workflow.** The standalone fleet-baseline workflow — and the `.github/` managed
copy it forced every enforcer to host, deliverable only by the withhold-and-hand-to-the-agent path
([#649](https://github.com/missingbulb/Claudinite/issues/649)) — was retired on 2026-08-11
([#749](https://github.com/missingbulb/Claudinite/issues/749); the
[`fleet-baseline-task`](migrations/2026-08-11-fleet-baseline-task/migration.mjs) record removes
lingering copies). The lever is now the [`fleet-baseline`](tasks/fleet-baseline/task.md) task,
`frequency: manual`: never due on any cadence, run by pressing *Run workflow* on the vendored
scheduler with `overrides: FORCE_TASKS=fleet-baseline` (plus `REPOS=…`, `DRY_RUN=true`,
`INCLUDE_DORMANT=true`). It fires each member's own scheduler with `FORCE_TASKS=update` and does
**not** wait: a dispatch queues a member's own run, and each member reports its own outcome where it
always does.

**Where the code lives** — each sweep sits **inside its task's folder**, because only that task's
`worker.mjs` uses it. The pack root holds just what they all
need: [fleet-api.mjs](fleet-api.mjs) (cross-repo REST primitives — read-only toward members but for the
one `putFile` the pack-seed sweep needs) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of the entry `config` below).

**Config** — this repo's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"],
                                "canonRepo": "missingbulb/Claudinite", "staleDays": 14,
                                "packSeeds": [{ "id": "<a pack>", "config": { … } }],
"digest": { "pick": 4, "nudge": { "enabled": true, "quietDays": 7 } } } }
```

`owner` (default: this repo's owner) is who to cover; `exclude` is the repos deliberately kept out of
the fleet (a full `owner/name` each) — a repo is kept out by adding it here. `kind: "user"` today; org
support is a later addition. `canonRepo` (default `<owner>/Claudinite`) is what a member's stamped ref
is measured against — named rather than inferred, because a ref tells you nothing about where it came
from. `staleDays` (default `14`) is how far behind is too far. `packSeeds` (default: **none**) is what
this fleet wants every member to declare — each `{ id, config? }`, seeded into members that lack it. This
list is the **only** place a pack is named: the sweep carries the mechanism, the fleet carries the
choice. `digest` (default: everything) is the brief's two knobs — `pick`, how many accomplishments
it names (default `4`; the shortlist is `ceil(pick × 1.5)`), and `nudge`, the "worth returning to"
prod (on at 7 quiet days; `false` switches it off, `{ "quietDays": 21 }` widens the window). Quiet
is measured on **meaningful merges, never on pushes** — every member's mount is converged nightly,
so `pushed_at` is fresh on every repo in this fleet every day and would report the whole fleet as
permanently active. Every key defaults, so an existing sheepdog config keeps working untouched.

**Classification** — the roster, usage and pack-seed sweeps are ordinary **pack tasks**,
not fleet mechanisms. Their *implementation* — an account-spanning PAT — happens to scan every repo
under the owner, but their declaration, scheduling, and lifecycle are exactly those of any pack task.
None declares the `fleet` signal; the cross-repo reach lives in the implementation, never in how a
task is wired. (The task files carry the same note.)

**No agent that reaches another repo, and no session scope, anywhere in this pack.** Every task that
touches a member is `agent_model: none`; the agentic work a fleet operation needs happens in the
*member*, run by that member's own executor under its own grant. The digest's agent is the one
exception that proves it — it reads a shortlist prework already fetched and writes one file **in
this repo**, crossing no boundary at all. That is not an implementation detail but the trust model
([#749](https://github.com/missingbulb/Claudinite/issues/749)), learned the hard way: the first
fleet-add-missing-packs design ended in an enforcer-side agent stage, and its very first production
run stopped at `needs-human` because the enforcer's executor is — correctly — scoped to the enforcer
repo alone. What crosses a repo boundary is an issue and a `workflow_dispatch`, both over the
`FLEET_GITHUB_TOKEN` PAT; the deprecated task-level `session_scope`
([scheduled-tasks.md](../core/scheduled-tasks.md)) has no place here.

**A SCANNED finding is a recommendation, never a verdict.** The `pack-declaration` conformance check was
deliberately retired ([engine/checks/README.md](../../engine/checks/README.md)) because whether to
declare a pack is the project's call — a marker is a way to *suspect* a pack is wanted, never proof it
must be. The scan must not re-introduce that check one rung further out: it opens an issue in the member that
the member's own agent (then a reviewer) acts on, its body says "suspects", and a `not planned` close
is a standing answer the scan honours rather than reopening weekly. A **forced** addition is the other
thing entirely — a decision already made, by the one person entitled to make it — so its issue carries
the config and the interview answers with it, and the member's agent adopts what it says rather than
re-judging whether it was wanted.

**The scan fingerprints against CANON, not against this repo's mount.** A consumer's
`.claudinite/shared/` carries the vendor set for the packs *it* declares — four, for a sheepdog repo —
so running the fingerprints out of the mount would test every member against a handful of packs and
report the whole fleet as perfectly fitted. That failure is silent by construction, so the sweep
shallow-clones `canonRepo` to scratch, loads the corpus from there, refuses to run at all on a corpus
too small to be canon, and **states the denominator in its report** (*"fingerprinted against N canon
packs from `owner/Claudinite`"*). Fetching also makes the fingerprints current rather than as-of this
enforcer's last baseline: a pack added to canon this week is one the fleet should be measured against
this week.

**Undecidable is not a non-match.** Most fingerprints are answerable from a path listing, and the sweep
answers those over one tree call per member. A fingerprint that reads file *contents* is resolved by a
bounded prefetch of exactly the files it asked for; one that greps every source file exceeds that budget
and is reported **undecided**, never `false`. The member's own agent — which has the repo checked out —
settles those exactly (`localFits`, [tasks/fleet-add-missing-packs/fingerprint-fit.mjs](tasks/fleet-add-missing-packs/fingerprint-fit.mjs)).
A truncated tree listing makes every non-match on that repo undecided for the same reason: "we did not
look" and "we looked and it isn't there" are different facts, and only one is safe to act on.

**How they run** — as the pack's [`fleet-roster`](tasks/fleet-roster/task.md) (`daily`),
[`fleet-add-missing-packs`](tasks/fleet-add-missing-packs/task.md)
(`weekly`), [`fleet-usage`](tasks/fleet-usage/task.md) (`daily`) and
[`fleet-pack-seeds`](tasks/fleet-pack-seeds/task.md) (`daily`),
[`fleet-baseline`](tasks/fleet-baseline/task.md) (`manual`) and
[`fleet-digest`](tasks/fleet-digest/task.md) (`daily+1h`) scheduled tasks, each with its
sweep as `prework`. All but the digest are `agent_model: none` and `expected_outcome: none` — what
only a repo edit
can finish is the member's own adopt-requested-packs task's, ceilinged at `open-pr` *there*,
because declaring a pack switches on checks that run in the member's CI the moment they land, so it is
always reviewed; the usage sweep is `merged-pr`, because its output IS a tracked file and an
auto-merging PR keeps that write inside the outcome taxonomy, lets this repo's CI gate a malformed
file, and makes the daily PR stream a browsable audit trail. The pack-seed sweep is `none` for a
different reason: its write goes to **other** repos, and the ceiling describes what a task may do to its
own. The roster is daily on its coverage question's cadence, and its freshness half rides along
rather than gating itself on a weekly clock it would have to compute — two extra reads per covered
member, and a drift verdict that is silent unless the root cause changed; usage is
daily because the members fold daily; pack seeds is daily because a member becomes writable the moment
its nightly converge vendors the pack, and daily makes that "the next morning". The digest is
`daily+1h` — an hour behind the rest, because nothing in it depends on them but a brief written
while the census is still running would report a fleet in mid-sweep, and the owner reads one story
about the fleet each morning, in order; it is `sonnet` and `merged-pr`, the same reasoning the usage
sweep's ceiling carries, and its `required_secrets` adds only **Pull requests: read** to the PAT
below. There is **no coverage workflow** — preprocessing
runs Action-side inside this repo's one scheduler workflow, so the repo Actions secret is already
reachable there; each task's `required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that
workflow's env and is what asks the owner for it (a fine-grained PAT spanning the owner's repos:
Metadata read, **Contents read and write**, Issues read/write, Pull requests read — the roster's
freshness half adds no scope, the digest adds only the pull-request read, and the pack-seed sweep is
what raises Contents from read-only across the fleet to
read/write, because writing one declaration into each member is its whole job; Contents write on
this repo also covers baseline-migration retirement). A workflow that exists only to hold a secret is redundant
([packs/core/scheduled-tasks.md](../core/scheduled-tasks.md)) — the force-baseline workflow above is
not that: it exists because the operation is manual, and it reads the same secret only incidentally.

**The one scope the read-only sweeps don't need** — the two fan-out tasks (fleet-baseline,
fleet-add-missing-packs) add **Actions: read and write** on the owner's repositories to that PAT.
Dispatching another repo's workflow is an Actions *write*, so a token scoped for the read-only
sweeps alone answers `403` on every member. Both report that per repo as `no-permission` and fail
the run rather than retrying: it is a grant to fix once, not a transient.

**What freshness measures** — by **version**, not by date (#786). The update flows stamp
`engineVersion` and `packVersions` and deliberately never write `ref` or `updated`, so on a maintained
member the stamped ref is FROZEN and its age measures nothing; `behind` is `installed < canon`, per
component, and the drift issue names the version that is missing. There is no window to tune, because
nothing is being estimated — `staleDays` governs only the legacy date measure, kept for a member still
declaring the retired `baselining` mechanism.

**Full-roster reporting** — every sweep's report enumerates the whole fleet, not just its findings.
Each repo under the owner lands in the report under exactly one named state — covered, dormant,
uncovered, opted out, archived/fork, unknown, fresh, behind, fitted, out of scope, inactive today,
skipped with a reason — and the repos a sweep deliberately never measures (the enforcer itself, canon) are
named as such rather than silently absent. The sheepdog provides data on the fleet regardless of
state: a roster that names only the exceptions has silent holes, and a reader cannot tell "fine"
from "fell out of the report".

**When they fail** — a repo whose declaration the roster cannot read is `unknown` to **both** its
questions, never uncovered and never behind; a member whose *mount probe* fails is `unknown` to the
freshness question alone, because its declaration was read and the coverage verdict stands; a member
the fit scan cannot read is `unknown`, never fitted, and a member whose scheduler refused the
fan-out dispatch is named and fails the run — a work list nobody will act on is not a green
outcome; a member the pack-seed sweep cannot read or write is `unknown`, never assumed converged: no issue opened, no open issue closed on its
behalf, and a non-zero exit. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.
