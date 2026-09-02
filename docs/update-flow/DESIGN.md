# Update flow — design

Canon changes reach the fleet through **the converge**: a nightly, per-member reconciliation of
the member's tree against a desired state computed from one qualified canon snapshot, delivered
as a single commit on a single PR whose content includes its own record of delivery. Member
workflow files are permanent one-job **shims** that call reusable workflows hosted in the canon,
so the one path an Actions token cannot write is also the one path that never needs writing —
the nightly runs on `GITHUB_TOKEN` alone, and no per-member credential exists anywhere. The
flow is entirely deterministic — no model runs anywhere in it; judgment reaches members through
three lanes outside it (standing check findings, enforcer-placed repo tasks, and a
Shepherd-guided supervised process for fleet-wide breaking changes). There are no one-shot
migration records, no staging areas, no version numbers anywhere in delivery: the unit of
delivery is the whole snapshot, and a snapshot sha — or a tag naming one — is the only identity
anything reads, a member's pin included.

## One qualified snapshot: `fleet-current`

`fleet-current` is a branch ref in the canon, protected fast-forward-only, advanced only by
qualification. It is two things at once: the snapshot each member's converge reconciles its
tree to, and the `@ref` every member shim names in its `uses:` line — so advancing it delivers
content on each member's next converge and workflow *logic* on each member's next trigger, both
from the same qualified commit. Its history keeps every fielded snapshot fetchable (the
deletion rule needs that); its FF-only protection holds "members only move to descendant
snapshots" in one place instead of one guard per member. Everything a member runs — engine,
packs, rules index, the workflow bodies behind its shims, and the delivery program itself
(`delivery/run.mjs` and helpers; entry-point paths and callee paths are stable contracts,
shimmed if they ever move) — is content of that snapshot. Members run no resident copy of the
delivery program: every run fetches it fresh, by anonymous clone of the public canon, at the
snapshot it is delivering — so delivery logic is exactly as current as the content it delivers,
and a broken delivery program is repaired by the next snapshot through the same route, never
through itself.

## The desired state of a member

`desired(S, member)` maps a snapshot sha `S` plus the member's own tree and identity to the
member's full canon-derived state.

**Computed** (canon-authored; the member's copy must byte-equal it):

1. The mount `.claudinite/shared/`: engine, declared packs, delivery code, rules index.
   Wholesale — files the canon no longer carries leave the mount.
2. The **workflow shims** under `.github/workflows/`: the scheduler shim, the executor shim,
   and one shim per declared pack's member-triggered workflow (release pipelines). Each is a
   near-permanent file — its triggers (the scheduler's hashed cron minute is the one
   member-varying byte), a fixed `permissions:` ceiling (per shim: the union of scopes any job
   of its callee holds — the scheduler's and executor's four, a Pages-deploying release shim's
   `pages` and `id-token`), one `uses:` line naming a canon-hosted reusable workflow at
   `fleet-current`, `secrets: inherit`, and an opaque `args` passthrough
   for dispatch inputs so the dispatch schema never changes again. Everything that varies —
   job bodies, statically-named secrets (the fleet union, named in the canon-side callee; an
   unset name arrives empty and is probed, below), `${{ toJSON(vars) }}` reads, step logic —
   lives canon-side, where an ordinary canon commit changes it. The shims are part of
   `desired`, but the converge only **verifies** them (an Actions token cannot push
   workflow-file changes — GitHub refuses the whole ref): a shim that diverges from its render
   is reported into the needs-attention issue, never silently tolerated; shims are *written*
   only by session-credentialed acts — install, the adopt task, a Shepherd-guided event.
3. The stamp's `canon`/`at` fields — included only when something else differs or `S` moved, so
   a current member yields a byte-empty diff, not a nightly timestamp commit.

Composite actions and shared steps are canon-hosted and referenced cross-repo at
`fleet-current`, like any public action; no pack materializes action files into member
`.github/` at all.

**Deletions** derive from two pure computations, never recorded bookkeeping: candidates are
`paths(desired(stamp.canon, member))` — widened to the union over all canon packs, so a
since-undeclared pack still yields its leftovers — minus `paths(desired(S, member))`. A
candidate is deleted only when its on-disk content byte-matches the old snapshot's render for
this member: literal proof of canon authorship before any destruction; a non-matching candidate
stays, reported as an advisory. A candidate under `.github/workflows/` is never deleted by the
converge (the same token refusal covers deletions) — it is reported for the next
session-credentialed act to remove. Unknown or unfetchable `stamp.canon`: delete nothing
outside the mount root, orphans become advisories. (Inside the mount root no proof is needed —
that root is wholesale canon-owned.)

**Normalization** (member-owned files; surgical, idempotent, preserving everything not named):

4. `.claudinite-settings.json`: apply the permanent rename map (every legacy spelling straight
   to the current one — one map, no chaining), reshape legacy structures, seed absent required
   *config keys* with defaults — seed-never-override: an existing value, interview answers and
   reviewed accepts above all, is never rewritten. **Pack entries are never written here**: the
   declaration's pack list is the member's decision, written only where a decision happens —
   install, an in-session `adopt-pack`, or the enforcer-placed adopt task (below) — so the
   converge neither adds nor removes a pack entry and an owner's removal is durable, never
   relitigated. A declared pack id the rename map cannot resolve is skipped and reported, never
   dropped, never fatal. A pack owns the rules for its own config subtree — exported from its
   manifest, composed into the engine's — so a pack that changes its own contract ships the
   rule with the change, retired by the same condition. Edits are anchored-text, never a
   re-serialize. A missing or unparsable
   declaration on a stamped member is a needs-human state and no convergence — least of all a
   destructive one — runs against it: that shape is evidence of damage, not a pack-less member.
5. `.claude/settings.json` hook wiring: set-union — add missing required hooks, never remove or
   clobber member entries; the parse this requires makes the converge the harness-independent
   detector for an unparsable file (skip the unit, report it). `.gitignore` lines,
   `.gitattributes` entries, the one `CLAUDE.md` import line: add-if-missing.

**Per-unit isolation**: one throwing normalizer rule or unreadable member-owned file skips
exactly that unit, reports it by identity, and delivers the rest; a unit skipped beyond a cycle
is a stuckness signal keyed to the unit, not the member. **Retirement is read off the fleet**:
a normalizer rule or rename-map entry may carry a retirement condition — "the enforcer's report
shows no member recorded below snapshot X for a full converge cycle" (dormant members included;
their stamps stay readable) — and is removed only when it reads true.

**Never in `desired`,** hence structurally untouchable by any converge: member source, tests,
build config, local packs, README content, the one-time install seeds, console state. That is
the build-safety guarantee's strong form — a nightly cannot break a member's own build because
the surfaces that build it are not writable by the converge at all.

**Pins are an input to `desired`, never a flow of their own.** A declaration may hold the whole
member at a sha or tag on `fleet-current`'s line (`canonRef`, the canary's field aimed
backward — its shims then render at the pin too, and declaring it is the session act that
rewrites them), or hold one pack there (`packs: [{ "id", "pin" }]`): that pack's mount subtree,
and the shims of any workflow it brings, render from the pinned snapshot, everything else from
`S`. A pin points backward only — an ancestor of `S`; a pin ahead of `S` is reported and
ignored — so the engine at `S` meets packs no newer than itself, and the canon's one
compatibility promise is one-directional: the engine reads every pack shape it ever shipped,
the forward-tolerant-reader posture already required for member-owned files. That promise
replaces `minEngineVersion`, which only ever guarded the other direction; wanting an older
engine is not a pin but a whole-snapshot hold. The canary qualifies no pinned pair, so the load
gate is a pin's safety: a delivery that breaks a pinned pack reads *worse*, blocks, and names
the pin. The stamp records the effective pins, so the old tree's render — the deletion rule's
input — stays reproducible after a pin is lifted.

## The stamp: `.claudinite/state.json`

```json
{
  "format": 1,
  "canon": "<sha>",   // snapshot this tree was computed from — written by the delivery commit itself
  "at": "<iso8601>",  // when that computation ran
  "pins": {}          // effective pins at that computation — pack id → sha; absent when none
}
```

`canon`/`at` are written only inside the delivery commit they describe: claim and content are
one atomic write. The stamp is the cheap query surface and nothing more — no delivery decision
trusts it over content — and is read-side tolerant forever: unknown keys preserved and
reported, legacy formats mapped, a missing or unparsable stamp meaning "unknown — converge by
content, write a fresh one", never "version zero".

## The resident shell: thin shims

The shim inversion is field-verified (2026-09-01/02, ClaudiniteCanary `shim-probe` runs 1–4
and `shim-probe-widen` run 1, recorded on #1547): a member shim called a canon-hosted reusable workflow cross-repo at a
branch ref; the callee ran in the member's own context (its repo, its ref, its dispatch inputs
forwarded); editing only the canon side changed the member's behavior with the shim
byte-unchanged; and `secrets: inherit` delivered the member's own secrets into the canon-hosted
callee — same-owner repositories, which the fleet's are. Two standing constraints come with it:
the fleet stays under one owner or organization (`inherit` does not cross owners), and a
member's Actions policy must allow the canon's reusable workflows (a one-time install check).

The **scheduler shim** (`.github/workflows/claudinite-scheduler.yml`): the hashed cron (repo
full name + `dailyHour` anchor), `workflow_dispatch` with `force`, `override-gate` (free-text
reason; empty = none), `canon-ref` (operator aiming; default `fleet-current`), and an opaque
`args` string for anything added later; a fixed `permissions:` ceiling (contents, issues,
pull-requests, actions: write — exactly today's stub grant, so nothing narrows at the
cutover; a callee job with no `permissions:` block inherits the ceiling verbatim, one with a
block holds the intersection, and one naming a scope outside it fails the run at planning with
no job created — field-verified 2026-09-02 — so a new scope is a shim-shape change, never a
canon commit); one `uses:` line at `fleet-current`; `secrets: inherit`; and `CLAUDINITE_STUB_CONTRACT` passed as a `with:`
value naming the shim generation. The canon-side scheduler callee does everything the shim
does not: checkout, resolve `S`, shallow-clone the canon at `S`, run `delivery/run.mjs`, the
failure job that escalates any red run into the member's needs-attention issue. Task secrets
and the routine token are referenced only in the callee jobs that legitimately use them, never
in the converge's own job. The converge runs before, and independent of, the task-queue drain
the same callee hosts — a broken queue must not block delivery of its own fix. The callee
resolves `S` itself; the one skew window — `fleet-current` advancing between trigger and
resolve — spans two qualified, interface-additive snapshots and is benign.

The **executor shim** carries the queue's label-event triggers and the same
uses/inherit/ceiling shape; the fleet-union secret names, the per-job narrowed permissions, and
the secrets-emptiness probe (a step in the work job observes which named secrets arrived empty
and opens/updates the needs-attention item with the observation — "the workflow passed `FOO`
and it was empty" — never an inferred cause) all live in the canon-side executor callee, where
a newly required secret or scope is an ordinary canon commit, not a member-file change.

The shims are deliberately too small to ever be wrong twice: nothing member-varying but the
cron, nothing behavioral at all. The callee interface is the one seam that outlives any shim
generation, so it evolves additively forever — `CLAUDINITE_STUB_CONTRACT` says which generation
called, new dispatch inputs ride `args`, and an input or secret name is never removed while any
member can still hold a shim naming it.

## The converge run

Each scheduled or dispatched run of `run.mjs`, on the member's own Actions:

1. **Resolve** `S` (a declaration may pin `canonRef` — the canary does).
2. **Direction guard, three-way**, fetching enough history to answer ancestry (a shallow
   clone's silence is never trusted): `stamp.canon` ancestor of `S` → proceed; `S` ancestor of
   `stamp.canon` → end `current(ahead)`, never rewriting a member backward; **neither** →
   `needs-human`, never a green: "recorded snapshot and target have diverged; a canon history
   rewrite or ref corruption produces this". Runbook: the operator verifies, admin-moves
   `fleet-current` onto the new line, members converge on dispatch — one traced act. An unknown
   recorded sha is its own state: converge by content, say so in the PR body.
3. **Compute** `desired(S, member)`, deletions and per-unit skips included.
4. **Gate**, three checks in order:
   - **Write-validation**: everything about to be pushed is validated as an artifact —
     JSON-parse every written JSON file, well-formedness checks on every rendered text.
     Separately, the shims are **verified**: each on-disk shim is compared to its render, the
     scheduler's cron and `workflow_dispatch` trigger are asserted parseable and present, and
     any divergence is a needs-attention observation (the converge cannot write workflow
     files; a person or the next session-credentialed act repairs them).
   - **The load gate, three-valued on the delta**: run the same loader against the replaced
     tree (on disk at checkout) and the computed tree; compare failure sets. *Better* →
     deliver. *Same-broken* (identical nonempty sets — the member's own content breaks the
     load, tonight and every night) → deliver, and escalate the standing failure to the
     needs-attention issue: canon content keeps flowing to a member whose fault the canon
     cannot fix. *Worse* (the delivery introduces failures) → `blocked`, the delta as the
     observation. `override-gate` forces past *worse*, per-invocation, reason landing in the
     PR body — never a stored default.
   - The loader takes an explicit root argument and never inherits its root from the
     environment — the gate must be incapable of auditing the wrong tree. The converge also
     age-checks the hook lane's recorded heartbeat (the hook log): code-work checking the hook
     lane from outside it, because a detector must not ride the thing it detects.
5. **Diff** against the working tree. Byte-empty → `current`, a *verified* statement ("tree
   matches the computation at S") — the only kind of success this system reports. GC: a
   delivery branch whose content is already on `main` is provably leftover — delete it, close
   its PR saying why. Nothing is GC'd by age.
6. **Push** the delivery commit on the standing branch `claudinite/delivery` (recomputed from
   `main` and force-pushed every run — derived state, never accumulated), with `GITHUB_TOKEN`.
   The diff touches no workflow file by construction, so the push always has a lane; a
   rejection (branch protection, disabled Actions writes) is a needs-human observation with
   the enumerated causes.
7. **Open-or-update the PR** (`GITHUB_TOKEN` API): body carries `computed-from: S`, the diff
   summary by class, override traces, unknown-state notices, per-unit skips, shim-divergence
   notices. One standing PR; every delivery is a reviewable diff in the member's own repo. A
   PR-creation refusal is a needs-human observation whose enumerated causes include the
   repository setting that gates Actions-created pull requests.
8. **Merge per the member's recorded preference.** Auto-merge: the merge API, same token — an
   API merge fires the member's own `on: push` workflows on the default branch exactly as a
   human merge does, so release-on-push pipelines see delivery merges; there is one merge
   lane, with one cascade behavior. A refusal (branch protection, required reviews) ends
   `pending-review`, the observation distinguishing "recorded preference says auto-merge but
   protection contradicts it" from genuine hold-for-review. Hold-for-review members stop at
   `pending-review`; the human merges. If `main` moved since the branch was built, rebuild and
   retry once or twice in-run, else defer to the next run.
9. **End** `delivered`.

A crash between any two writes leaves: nothing, a branch, or a branch+PR — every prefix inert
or rebuilt from scratch next run; no claim is ever advanced early, because the only claim lives
inside the delivery commit itself. And `converge(converge(member))` writes nothing.

## Qualification: the canary and the advance

Canon CI qualifies every change at fixture level (suite, engine/mount self-test, shim-render
and callee-YAML checks). One real member qualifies every snapshot the fleet takes: the
**canary member** declares `canonRef: "main"` **and its shims pin `@main`**, so every canary
run exercises the current callees and the current delivery program — compute, validate, gate,
push, PR, merge, load — against canon `main` before any other member sees either. After a
green terminal, the same run advances `fleet-current` to the sha it verified, pushing with
`CLAUDINITE_CANON_TOKEN` (a secret held by the canary alone, minted at its install); FF-only
protection makes a non-descendant advance impossible. Because fleet shims pin `@fleet-current`,
a callee change is delivered to the fleet by the advance itself — exercised on the canary by
construction before any member's trigger resolves it.

A change to the **shims' own shape** (a new trigger, a widened ceiling, a moved callee path) is
the rare event the nightly cannot deliver: it runs as a Shepherd-guided fleet pass (below),
canary first, with the canon-side callee accepting both shim generations across the window.

The advance is non-vacuous: it records the canary run id and delta size, and an empty-delta
verification advances with "verified current at S — no member-visible delta". On red,
`fleet-current` stalls — the fleet keeps its last good snapshot and its last good callees — and
the canary opens a canon issue "qualification red at <sha>: <observation>" with the same token.
The stall is loud twice: that issue, and the enforcer's named canary-down condition. Urgent-fix
runbook while the canary is down: per-member `canon-ref: main` dispatch (aimed, traced), or an
operator FF of `fleet-current` by hand after verifying — per-invocation acts, never stored
defaults.

**Coverage caveat**: the canary qualifies what it declares. Packs it does not declare — release
pipelines above all — are qualified by fixture renders and callee-YAML checks only, so a
semantic breakage there ships canary-blind to exactly the members it affects (open decision 1).

## Install and pack addition

First contact runs in an interactive, human-present session via `delivery/install.mjs` — the
one moment a person is reliably there. It refuses a repo already carrying a stamp or mount (the
converge is what brings an existing member current; seeds and interview answers are never
relitigated), then: the batched interview, answers recorded verbatim; the same converge
computation at `fleet-current`, in-session — the session's human/app credential writes the
shims freely, and the member gets the newest shape directly, nothing replayed because nothing
exists to replay; the **seeds**, here and only here (and at `adopt-pack` for a newly declared
pack's) — the README badge row, a minimal CI workflow only where the repo has none, the starter
local pack — the converge has no seed code path, so "never re-applied" is structural;
**settings provisioning** — enable the repository setting that lets Actions open pull requests
(the converge's PR step depends on it) and confirm the Actions policy allows the canon's
reusable workflows, anything the session cannot do becoming a handover checkbox; the routine,
with endpoint config naming the secret's *name* only; **the handover issue** — one, a checkbox
per human-only step, each with what breaks while undone and what closes it: mint
`CCR_ROUTINE_TOKEN` into the repo secret, finish the routine's console binding, paste the
web-environment setup script, plus any provisioning step the session could not perform.
Finally the stamp: `canon` = the install snapshot.

Pack addition (`adopt-pack`, in-session) is the declaration entry, that pack's interview and
seeds, its shims, then the same converge. A declared pack that adds a required question in a
later snapshot: the converge never guesses and never asks — it lists the unanswered questions
in the needs-attention issue; pack content still delivers; the member's next human session
answers. Fleet-driven addition — the fleet manager deciding a pack belongs in members that
already run — arrives as an enforcer-placed adopt task per member (next section), never as a
converge-side write; the adopt task's session credential writes any shims the pack brings.

## Adaptation: judgment never rides the update flow

The update flow summons no session, ever. When changed rules meet member-authored content the
canon has never seen — a rename whose other spellings live in member prose, a local pack built
against a retired contract, tests a new rule turns red — the repair reaches the member through
three lanes, none of them part of a converge:

- **A standing check finding, shipped with the change** (the default). The author of a rule
  change that meets member-authored content ships, in the same snapshot, the check that
  flags the residue; the converge delivers both, and the member's own next working session
  resolves the finding. A finding is durable and self-re-deriving — it survives dormancy,
  parked sessions, and any staleness, where a dispatch is a moment that can be missed once and
  is gone. Red member tests after a rule delivery are the same shape: the nightly lands the
  rule (build-safe by construction), the finding or the red test is the signal, and the
  member's sessions repair.
- **An enforcer-placed repo task** (proactive drive). When the fleet manager decides work
  should happen in members now — a new pack fleet-wide, a guidelines sweep worth driving — it
  converges one work-list issue per member, and the member's own scheduler and executor run it
  with the member's own agent; no agent anywhere needs cross-repo access. The adopt task lives
  in `claudinite-lifecycle`; the enforcer's issue is the place to say no, before work is
  placed. Automerge for such a task is **surface-scoped in the task's declaration** — a PR
  touching only the surfaces the task is for lands unattended; a PR beyond that scope parks
  for review.
- **A Shepherd-guided supervised process** (fleet-wide breaking changes — and the rare
  shim-shape change). A change that must touch every member's member-owned surfaces, or their
  workflow shims, is run by an actor with fleet-wide access executing a code-plus-agent script
  over the fleet under manual guidance, pilot first — never by the unattended nightly.

The workflow surface needs no credential lane at all: member workflow files are permanent
shims, everything that changes lives canon-side, and delivering it is an ordinary canon commit
plus the qualified advance (#1296's wedge — a member whose executor content was wrong and could
never run the session that would fix it — has nothing left to wedge on: executor *content* is
canon-side, and no delivery path depends on the executor).

**Out-of-GitHub state** stays content-thin: the routine's stored prompt is one pointer line at
a vendored file, so console state almost never changes and content changes ride the pointed-at
file. No update path depends on the routine — it serves the task queue only — so its breakage
delays placed tasks, never delivery. Verification uses the only contexts that can see each
half: a standing in-session check — any session in the member — verifies the routine exists
and is still just the pointer; the executor callee's probe observes `CCR_ROUTINE_TOKEN`
emptiness. A canon change that genuinely requires console action becomes a per-member
needs-attention item, never a silent degradation.

## Observability: terminals, the needs-attention issue, the enforcer

Every run ends in one of five uniform terminals: `current` | `delivered` | `pending-review` |
`blocked` | `needs-human`; a run that delivered nothing can claim `current` only by verifying
currency against content. Per member, everything is member-recorded: the stamp, the standing
delivery PR, and one labeled needs-attention issue (`claudinite:needs-human`) whose body always
carries the observation, the enumerated causes (never one inferred cause), the awaited action,
what breaks while it stands, and what closes it. Its age is the escalation signal, and a member
carrying one still accepts every delivery that does not require the human step — per-unit skips
make partial delivery expressible. Four operator-readable conditions per member, no sessions or
run logs needed: **delivered** (stamp `canon` = `fleet-current`, no open delivery PR),
**in-flight** (open delivery PR / `pending-review`), **owed** (stamp behind with no open PR, or
last terminal `blocked`), **needs-a-human** (the labeled issue exists).

The fleet enforcer repo owns the member list — the canon holds no repo list and no per-member
state — and its contract is:

- **Report**: windowed comparisons — which members moved this window vs last, who is behind
  `fleet-current` and how long *since canon moved*, `fleet-current`'s own age against canon
  `main`, needs-attention items and ages, unit-keyed stuck signals, shim-divergence notices. A
  member it cannot read is named absent, never guessed; no cumulative totals; no point-in-time
  stamp read as a window.
- **Skew findings double as delivery probes**: a member that converged and still reports an
  unplaceable key did not actually move — a verification signal independent of both stamp and
  run conclusion.
- **Canary-down is a named condition**: "fleet-current has not advanced in N days while canon
  moved", beside the per-member rows, with the urgent-fix runbook line.
- **Wake**: a member whose stamp stopped moving while canon moved beyond a bound gets
  API-enable of its scheduler workflow (GitHub disables scheduled workflows after repo
  inactivity; enable-then-dispatch is correct whether or not dispatch works while disabled)
  and a dispatch. **A failed wake escalates immediately** into that member's needs-attention
  issue with the observation — a broken scheduler shim is the one wedge whose inside cannot
  report, so "wake failed" is never just a log line.
- **Force sweep**: dispatch every member's scheduler with `force`, follow each run in parallel
  to its terminal, then read the stamps — the verdict is the stamps, never the dispatch (204
  means queued) and never run conclusions.

## Every member-hosted artifact, classified

| Artifact | Class |
|---|---|
| Mount tree, rules index, stamp | converged every pass (wholesale) |
| Workflow shims (scheduler, executor, per-pack) | written at install/adopt/Shepherd events only; byte-verified every pass — divergence and orphans are reported, never silently tolerated; the nightly never writes a workflow file |
| Declaration, hook wiring, ignore/attr lines, `CLAUDE.md` import | converged every pass (surgical, per-unit isolated) |
| Badge row, seeded CI, starter local pack, pack declarations | written once where a decision happens (install, in-session adopt, or the enforcer-placed adopt task); member-owned after; drift and removal are by design |
| Member local packs, member source/tests/build config | never touched |
| Routine, its token secret, setup script | checked-and-reported (in-session check, executor-callee probe, handover issues) |
| The canon's own two workflow copies | checked-and-reported: canon CI byte-compares them against the shim rendered for the canon itself |

No copied-once-and-unguarded artifact exists.

## Rationale

**One commit that carries its own claim.** The recorded fleet losses share a shape: content
separated from its claim, the claim advanced by a preparatory step, cleanup unable to tell
leftover from outstanding — #1545 is all three at once, five members losing content permanently
while every signal stayed green. One computed tree in one commit containing its own stamp
removes all three: no preparatory step, no deferred half for a hand-merge to orphan, the only
intermediate artifact (the branch) recreatable by construction. Multi-file git delivery is
otherwise a sequence of interruptible writes; shrinking the atomicity-needing part to one
commit buys the transaction git can give.

**Decisions read the artifact, not the bookkeeping.** What to deliver is a tree diff; what to
delete is proven by byte-match against the canon's own historical render. A wrong recorded
claim cannot mask a gap anywhere — the recovery that once had to be hand-built (#1546: content
re-issued above a wrong claim, gated on the destination's own content) is this system's
ordinary nightly behavior.

**The gate judges the delta, not the state.** A single red/green verdict refuses the cure
whenever the patient is sick: a member whose own local pack is broken reddens every night's
gate, and canon content stops flowing for a fault the canon cannot fix — #939's five-day
all-green freeze is that shape (the red gate parked the very PR carrying the fix). Comparing
failure sets between replaced and computed trees makes "the fix can always arrive" structural:
only a regression the delivery itself introduces blocks. The double load costs seconds.

**The workflow surface is made immutable instead of writable.** An Actions job's
`GITHUB_TOKEN` cannot push any ref that changes files under `.github/workflows/` — GitHub
refuses the entire push — and every credential that could (a per-member deploy key or PAT, an
app installation) is a minted credential a member must hold. The design removes the need
instead of acquiring the power: the member file carries only what GitHub forces member-side —
triggers, a permissions ceiling, the `uses:` line, `secrets: inherit` — and everything that
ever changes lives in the canon, delivered by the qualified advance of `fleet-current`. The
mechanism is field-verified (2026-09-01, ClaudiniteCanary shim-probe runs, #1547): cross-repo
call at a branch ref, caller-context execution, canon-side edits changing member behavior with
the shim byte-unchanged, same-owner `secrets: inherit`, and the ceiling's narrow-only rule all
confirmed live. What silent
dropping once cost (a fleet-needed line stranded on 13 members, #1509) has no surface left to
recur on: nothing is ever owed to a workflow file on the nightly path, and the rare shim-shape
change is a supervised, piloted fleet event. Secrets stay statically named in reviewed YAML —
canon-side, where naming a new one is a commit, not a fleet of member edits — and the flagged
`toJSON(secrets)` shape is never used anywhere.

**One snapshot kills the compatibility matrix.** Engine, packs, workflow callees, and the
delivery program arrive as one qualified ref, so no member holds a new engine against old pack
content or the reverse — the skew that froze the fleet for five days (#939), and the
unknown-key wedge where an old engine dropped every declaration in a file and failed the gate
that would have delivered the engine that knew the key (#1400), both become unrepresentable.
What remains is the shim generation seam, held additive forever, and forward-tolerant readers
everywhere: unknown input is reported and skipped per unit, never fatal, never silently
dropped.

**Shims are guarded because a scheduler that cannot fire silences its own repair.** A member
whose scheduler is broken neither converges nor accepts a dispatch — nothing inside can
report. Three guards: the shims are near-immutable (the nightly never writes them, so the
delivered-broken-render class has no writer); the canary's `@main` pinning exercises every
callee change before the fleet's shims can resolve it; and the enforcer's failed-wake
escalation is the outside noticing what the inside cannot.

**Migrations dissolve — the engine's and the packs' alike; decisions stay where decisions
happen.** The record format, its registry, the `appliesTo`/`legacyPresent` predicates, the
applied-list in the stamp and the landed-date window all go, and a check that once asked
whether a migration was still active asks the normalizer whether its rule is still live. Every
coded transformation of member state falls to: wholesale mount recomputation, canon-side callee edits behind permanent
shims, or the declaration normalizer — whose accretion is bounded by enforcer-read retirement
conditions, and whose rename map is permanent anyway, since readers must map every legacy
spelling regardless. What must *not* dissolve into standing convergence is the pack-entry
write: re-derived nightly it would relitigate an owner's removal forever, so pack entries are
written only by the acts that carry a decision — install, an in-session adopt, an
enforcer-placed adopt task — and the converge never touches them. With ordering gone (no delta
sequence exists, only current→desired), the ordering-tie class — a same-day equality once
skipped a change forever, #330 — has nothing to tie on.

**Updates are deterministic; judgment lives outside them.** Sessions are the expensive,
unreliable actor: for a period every mechanical change bought a model session on every member
(#798), and one night the same instructions made eight members deliver and five park. Keeping
every session out of the delivery path removes that whole failure family from updates — and
removes the done-ness ledger a dispatch lane would need, the one bookkeeping that could again
outrun its artifact. What replaces same-cycle dispatch is a better signal: a check finding
re-derives itself from the member's content forever, so a repair need is never lost, only
pending — and when pending is not good enough, the enforcer places the work as a task the
member runs itself, reviewed at the member.

**Observability is artifacts, not run conclusions.** Run conclusions are proven liars in both
directions — "done" recorded while delivery sat parked, a green fleet sweep over missing
content. The stamp, the standing PR, and the one labeled issue are the queryable surfaces; five
terminals keep every non-green end the same shape; windowed reporting with absences named keeps
fleet numbers honest.

## Alternatives considered

1. **A writable member workflow surface via a per-member minted credential** (a write deploy
   key or a fine-grained PAT held as a repo secret). Lets the nightly push workflow bytes
   directly, but every member must hold a standing credential that widens what its automation
   can write — with provisioning at install, a revocation/rotation story, and a per-member
   secret whose absence is one more degraded mode. Rejected as a direction: the same outcome
   falls out of making the surface immutable instead.
2. **Stage workflow content in-tree; a credentialed agent session lands it.** Splits delivery
   into a mechanical half and a deferred half: a hand-merge between them orphans the staged
   content, the claim outruns the delivery, and cleanup cannot tell leftover from outstanding —
   the #1545 interleaving class. Also prices credential work as model work and inserts session
   failure modes into the mechanical path.
3. **Full workflow bodies materialized member-side** (the writable-surface posture generally).
   Every logic change, secret addition, or permissions change becomes a per-member
   workflow-file delivery, which is exactly the class of write no unattended lane can make
   without alternative 1 or 2.
4. **Independently versioned units with one-shot migration records.** Costs the mixed-arrival
   compatibility matrix and its min-engine bookkeeping (#939, #1400), record ordering with
   tie-skipping hazards (#330), the record/registry/replay apparatus, and fetch-gates that
   wedge on exactly the content that would fix them; replay against a fresh repo is a hazard of
   its own, since records assume the shapes their era produced. What is rejected is version
   numbers as delivery bookkeeping, not holding a pack at an older snapshot: that is a pin, and
   costs one one-directional promise instead of a matrix.
5. **Push straight to `main`, no PR.** Delivery stops being reviewable in the member's own
   repo, and the per-member hold-for-review choice stops existing.
6. **Judge delivery by member CI, or qualify by fixtures alone.** Actions-token pushes fire no
   other workflows; GitHub can park a run behind an approval click unattended machinery can
   never press; fixtures test only what someone remembered to model. The verdict must be the
   delivery's own validation and gate, plus one real member.
7. **A recorded managed-paths list driving deletions.** One more bookkeeping format, and a
   hand-edited or badly-merged list becomes a delivery PR deleting member-owned files —
   destruction directed by a record instead of proof.
8. **A single-verdict red/green load gate.** Refuses the cure because the patient is sick
   (#939). The cheaper variant — gate canon content only, report member-caused red — kills the
   wedge but misses "canon change interacts badly with member config"; the double load is
   cheap enough to keep the full comparison.
9. **Blanket-permanent normalizer rules.** An unbounded legacy vocabulary every reader
   consults forever; per-rule retirement conditions read off the enforcer's report bound it
   with a converge-cycle-confirmable precondition.
10. **An agentic stage inside the update flow** — author-declared attention notes (or an apply
   stage) dispatched by the converge, with a completion ledger and canary-scoped pilots. Buys
   same-cycle repair, at the cost of a second dispatch mechanism whose actor parks, dies and
   drifts, pilot/scope machinery to bound its fan-out, and a done-ness ledger that
   reintroduces the claim-outruns-artifact gap unless every author also writes a destination
   probe — all for latency the finding and task lanes cover with no standing machinery.
11. **Converge-side pack seeding** — a fleet-seed flag plus a one-shot `seeded` memory in the
   stamp. Puts a member decision in the nightly's hands and adds the one stamp field a
   delivery decision would read; the enforcer already owns fleet intent, and its placed adopt
   task delivers the same outcome as reviewed member-side work.
12. **Member shims pinned to a sha instead of `fleet-current`.** Stricter per-member trust,
   but every callee change becomes a per-member workflow-file edit — the exact write the
   design exists to avoid; and members already execute canon code fetched fresh at run time,
   so the ref pin adds review surface only in appearance.

## Open decisions

1. **Canary coverage.** Packs the canary does not declare are qualified by fixtures and
   callee-YAML checks only. Recommendation: have the canary declare the widest safe superset;
   add a second canary in an affected family only if a fixture-blind breakage actually ships.

## Needs verification

1. **Private-repo behavior** — some or all members are private: verify a private caller can
   use the public canon's reusable workflows under its Actions policy settings, the
   scheduled-workflow auto-disable policy there, dispatch against a disabled or unparseable
   workflow (enable-then-dispatch and the failed-wake escalation are correct under every
   answer), and budget the Actions minutes the converge spends.
2. **`vars` context in a cross-repo callee** — the probe read an empty bag on a member with no
   variables set; confirm with a set variable that `${{ vars.* }}` in the canon-side callee
   reads the *member's* repository variables (the documented caller-context semantics).
