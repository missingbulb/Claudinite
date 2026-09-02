# Update flow — design

Canon changes reach the fleet through **the converge**: a nightly, per-member reconciliation of
the member's tree against a desired state computed from one qualified canon snapshot, delivered
as a single commit on a single PR whose content includes its own record of delivery. A member
runs entirely from its own tree; the canon is reached by the update act alone, the way a
package install reaches a registry, and nothing a member does between updates depends on the
canon being reachable. The one path the nightly cannot write, `.github/workflows/`, holds thin
**skeletons** — triggers, permissions, environment, the secrets a job passes, one step into
the mount — whose bodies live in the mount, so they rarely change; when a computed skeleton
differs from disk, the converge reports the owed files and fires the member's own routine with
one fixed instruction, run the deterministic sync script and push: a credential lane that
decides nothing, whose output is byte-checked against the render. The flow is otherwise
entirely deterministic — no model decides anything in it; judgment reaches members through
three lanes outside it (standing check findings, enforcer-placed repo tasks, and a
Shepherd-guided supervised process for fleet-wide breaking changes). There are no one-shot
migration records, no staging areas, no version numbers anywhere in delivery: the unit of
delivery is the whole snapshot, and a snapshot sha — or a tag naming one — is the only identity
anything reads, a member's pin included.

## One qualified snapshot: `fleet-current`

`fleet-current` is a branch ref in the canon, protected fast-forward-only, advanced only by
qualification: the snapshot each member's converge reconciles its tree to. Its history keeps
every fielded snapshot fetchable (the deletion rule needs that); its FF-only protection holds
"members only move to descendant snapshots" in one place instead of one guard per member.
Everything a member runs — engine, packs, rules index, the skeleton templates and the workflow
bodies behind them, and the delivery program itself (`delivery/run.mjs` and helpers;
entry-point paths are stable contracts, shimmed if they ever move) — is content of that
snapshot. The converge runs the delivery program from the snapshot it is delivering, fetched
fresh by anonymous clone of the public canon — the update is the one act that reaches the
canon — so delivery logic is exactly as current as the content it delivers, and a broken
delivery program is repaired by the next snapshot through the same route, never through
itself.

## The desired state of a member

`desired(S, member)` maps a snapshot sha `S` plus the member's own tree and identity to the
member's full canon-derived state.

**Computed** (canon-authored; the member's copy must byte-equal it):

1. The mount `.claudinite/shared/`: engine, declared packs, delivery code, rules index, and
   every workflow *body* — the scripts a skeleton's step runs and the composite actions a
   skeleton references by repo-relative path
   (`uses: ./.claudinite/shared/packs/<pack>/actions/<name>`; field-verified 2026-09-02,
   ClaudiniteCanary `composite-probe` run 1, recorded on #1547). Wholesale — files the canon
   no longer carries leave the mount.
2. The **workflow skeletons** under `.github/workflows/`: the scheduler skeleton, the
   executor skeleton, and one per declared pack's member-triggered workflow (release
   pipelines). A skeleton holds only what GitHub forces into the file: triggers (the
   scheduler's hashed cron minute is its one member-varying byte), a `permissions:` block per
   job, the environment and the statically named secrets a job passes (the executor's
   `required_secrets` union plus endpoint token names — a member-varying list, one line each,
   never `toJSON(secrets)`, the shape GitHub's malicious-workflow detection parks),
   `${{ toJSON(vars) }}`, checkout, and one step into the mount. Everything else — step logic,
   the drain, the continuation, failure reporting — is mount content, so a skeleton changes
   only when a trigger, a scope or a secret name does. Skeletons are part of `desired`, and
   the converge **computes and verifies** them every pass but never writes them: an Actions
   token cannot push a ref that touches a workflow file (GitHub refuses the whole push), so
   the write is the sync lane's (below). The **owed set** — skeletons whose on-disk bytes
   differ from their render, and workflow-path orphans — is re-derived from content every
   pass and never recorded: no ledger can outrun the artifact, no staged copy exists to sweep.
3. The stamp's `canon`/`at` fields — included only when something else differs or `S` moved, so
   a current member yields a byte-empty diff, not a nightly timestamp commit.

Nothing under `.github/` beyond the skeletons is canon-authored: no materialized action files
and no shared step libraries — every body lives in the mount, where the nightly writes it.

**Deletions** derive from two pure computations, never recorded bookkeeping: candidates are
`paths(desired(stamp.canon, member))` — widened to the union over all canon packs, so a
since-undeclared pack still yields its leftovers — minus `paths(desired(S, member))`. A
candidate is deleted only when its on-disk content byte-matches the old snapshot's render for
this member: literal proof of canon authorship before any destruction; a non-matching candidate
stays, reported as an advisory. A candidate under `.github/workflows/` is never deleted by the
converge (the same token refusal covers deletions) — it joins the owed set, and the sync lane
removes it under the same byte-match proof. Unknown or unfetchable `stamp.canon`: delete
nothing outside the mount root, orphans become advisories. (Inside the mount root no proof is
needed — that root is wholesale canon-owned.)

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
backward — its skeletons render at the pin too), or hold one pack there
(`packs: [{ "id", "pin" }]`): that pack's mount subtree, and the skeletons of any workflow it
brings, render from the pinned snapshot, everything else from `S`. A pin points backward only
— an ancestor of `S`; a pin ahead of `S` is reported and ignored — so the engine at `S` meets
packs no newer than itself, and the canon's one compatibility promise is one-directional: the
engine reads every pack shape it ever shipped, the forward-tolerant-reader posture already
required for member-owned files. That promise replaces `minEngineVersion`, which only ever
guarded the other direction; wanting an older engine is not a pin but a whole-snapshot hold.
The canary qualifies no pinned pair, so the load gate is a pin's safety: a delivery that breaks
a pinned pack reads *worse*, blocks, and names the pin. The stamp records the effective pins,
so the old tree's render — the deletion rule's input — stays reproducible after a pin is
lifted.

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

## The resident shell: thin skeletons, and the sync lane that writes them

The **scheduler skeleton** (`.github/workflows/claudinite-scheduler.yml`): the hashed cron
(repo full name + `dailyHour` anchor), `workflow_dispatch` with `force`, `override-gate`
(free-text reason; empty = none), `canon-ref` (operator aiming; default `fleet-current`), and
an opaque `args` string for anything added later; its jobs' `permissions:` (contents, issues,
pull-requests, actions: write — exactly today's grant); and per job a checkout and one
`run: node .claudinite/shared/…` step. The mount does everything the file does not: resolve
`S`, shallow-clone the canon at `S`, run `delivery/run.mjs`, escalate any red run into the
member's needs-attention issue, drain the queue. The converge runs before, and independent of,
the task-queue drain — a broken queue must not block delivery of its own fix.

The **executor skeleton** carries the queue's label-event triggers, the same shape, and the
statically named secrets its work step passes; the secrets-emptiness probe lives in the mount
(a step observes which named secrets arrived empty and opens/updates the needs-attention item
with the observation — "the workflow passed `FOO` and it was empty" — never an inferred
cause). A newly required secret or scope is therefore a skeleton change, delivered by the sync
lane; a task tolerates the window in which its secret is not yet passed — an empty value is a
reported state, never a crash.

**Per-pack skeletons** (release pipelines) are the same shape: triggers, `permissions:` per
job, checkout, `uses: ./.claudinite/shared/packs/<pack>/actions/<name>` — the whole body a
composite action under the mount path, changed by an ordinary canon commit.

**The skeleton generation seam**: a mount entry point accepts the previous skeleton
generation — a missing input, env var or secret is reported, never fatal — for as long as any
member can hold that skeleton, so the converge may land mount content before the sync lane
lands the skeleton that matches it, and the two never have to arrive together.

**The sync lane** is the one credential lane in the system, and it carries no judgment. After
its merge step the converge recomputes the owed set against the mount on `main` — so a
converge PR held for review holds its skeleton with it, and a skeleton never runs ahead of the
content it wraps. A non-empty owed set does two things: it is written into the needs-attention
issue with the one command that clears it, and the converge **fires the member's own routine**
— the same `POST …/routines/<id>/fire` the task queue uses, the same `CCR_ROUTINE_TOKEN`, a
payload naming the snapshot sha and nothing else, once and never retried (the endpoint offers
no idempotency key). The routine's stored prompt is one pointer at its tracked instructions
file; on a sync payload the session validates the payload in code and runs
`node .claudinite/shared/…/sync-workflows.mjs` — render `desired`'s skeleton set from the
mount on `main`, write, delete proven orphans — and pushes one commit on the standing branch
`claudinite/workflows` with its PR. The session's account credential is what writes workflow
files; nothing new is minted, provisioned or stored. **The output is checked, never trusted**:
the PR's diff must byte-equal the render — a merge-rule the member's automerge applies,
surface-scoped to the skeleton paths — and the next converge re-verifies regardless of who
merged what. Any human session in the repo runs the same script sooner; a member with no
routine, or whose routine failed to fire, keeps the owed set in its needs-attention issue with
that command — skeleton changes wait for a session, mount delivery never does.

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
     Separately, the skeletons are **verified**: each on-disk skeleton is compared to its
     render, the scheduler's cron and `workflow_dispatch` trigger are asserted parseable and
     present, and any divergence is the owed set — reported, and handed to the sync lane at
     step 9; the converge itself never writes a workflow file.
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
   summary by class, override traces, unknown-state notices, per-unit skips, the owed
   skeletons. One standing PR; every delivery is a reviewable diff in the member's own repo. A
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
9. **Sync**: recompute the owed set against the mount now on `main`; if non-empty, record it
   in the needs-attention issue and fire the routine once. A failed fire is a needs-human
   observation ("routine did not fire: <observed status>"), never a retry into the same wall.
10. **End** `delivered`.

A crash between any two writes leaves: nothing, a branch, or a branch+PR — every prefix inert
or rebuilt from scratch next run; no claim is ever advanced early, because the only claim lives
inside the delivery commit itself, and the owed set is derived, never claimed. And
`converge(converge(member))` writes nothing.

## Qualification: the canary and the advance

Canon CI qualifies every change at fixture level (suite, engine/mount self-test, skeleton
renders and workflow-YAML checks). One real member qualifies every snapshot the fleet takes:
the **canary member** declares `canonRef: "main"`, so every canary run exercises the current
delivery program and the current templates — compute, validate, gate, push, PR, merge, load,
and the sync lane through to its byte-checked skeleton PR — against canon `main` before any
other member sees them. After a green terminal, the same run advances `fleet-current` to the
sha it verified, pushing with `CLAUDINITE_CANON_TOKEN` (a secret held by the canary alone,
minted at its install); FF-only protection makes a non-descendant advance impossible.

The advance is non-vacuous: it records the canary run id and delta size, and an empty-delta
verification advances with "verified current at S — no member-visible delta". On red,
`fleet-current` stalls — the fleet keeps its last good snapshot — and the canary opens a canon
issue "qualification red at <sha>: <observation>" with the same token. The stall is loud
twice: that issue, and the enforcer's named canary-down condition. Urgent-fix runbook while
the canary is down: per-member `canon-ref: main` dispatch (aimed, traced), or an operator FF of
`fleet-current` by hand after verifying — per-invocation acts, never stored defaults.

**Coverage caveat**: the canary qualifies what it declares. Packs it does not declare — release
pipelines above all — are qualified by fixture renders and workflow-YAML checks only, so a
semantic breakage there ships canary-blind to exactly the members it affects (open decision 1).

## Install and pack addition

First contact runs in an interactive, human-present session via `delivery/install.mjs` — the
one moment a person is reliably there. It refuses a repo already carrying a stamp or mount (the
converge is what brings an existing member current; seeds and interview answers are never
relitigated), then: the batched interview, answers recorded verbatim; the same converge
computation at `fleet-current`, in-session — the session's own credential writes the
skeletons through the same sync script, and the member gets the newest shape directly,
nothing replayed because nothing exists to replay; the **seeds**, here and only here (and at
`adopt-pack` for a newly declared pack's) — the README badge row, a minimal CI workflow only
where the repo has none, the starter local pack — the converge has no seed code path, so
"never re-applied" is structural; **settings provisioning** — enable the repository setting
that lets Actions open pull requests (the converge's PR step depends on it), anything the
session cannot do becoming a handover checkbox; the routine, with endpoint config naming the
secret's *name* only; **the handover issue** — one, a checkbox per human-only step, each with
what breaks while undone and what closes it: mint `CCR_ROUTINE_TOKEN` into the repo secret
(while undone: no task sessions, and skeleton changes wait for a human session), finish the
routine's console binding, paste the web-environment setup script, plus any provisioning step
the session could not perform. Finally the stamp: `canon` = the install snapshot.

Pack addition (`adopt-pack`, in-session) is the declaration entry, that pack's interview and
seeds, its skeletons through the sync script, then the same converge. A declared pack that adds
a required question in a later snapshot: the converge never guesses and never asks — it lists
the unanswered questions in the needs-attention issue; pack content still delivers; the
member's next human session answers. Fleet-driven addition — the fleet manager deciding a pack
belongs in members that already run — arrives as an enforcer-placed adopt task per member
(next section), never as a converge-side write; that task's session writes any skeletons the
pack brings.

## Adaptation: judgment never rides the update flow

The update flow summons no judgment, ever. When changed rules meet member-authored content the
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
- **A Shepherd-guided supervised process** (fleet-wide breaking changes). A change that must
  touch every member's member-owned surfaces is run by an actor with fleet-wide access
  executing a code-plus-agent script over the fleet under manual guidance, pilot first — never
  by the unattended nightly.

The workflow surface has exactly one credential lane — the sync lane — and it decides nothing:
what to write is a pure render of the mount, what landed is byte-checked against it. #1296's
wedge (a member whose executor content was wrong and could never run the session that would
fix it) has nothing left to wedge on: the executor's content is mount content the nightly
writes, its skeleton is a few dozen lines that change when a trigger, scope or secret name
does, and the sync is fired by the converge directly, never through the task queue.

**Out-of-GitHub state** stays content-thin: the routine's stored prompt is one pointer line at
a vendored file, so console state almost never changes and content changes ride the pointed-at
file. One update path depends on the routine — the skeleton sync — and its breakage delays
skeleton changes and nothing else, any human session being the substitute; mount delivery
never depends on it. Verification uses the only contexts that can see each half: a standing
in-session check — any session in the member — verifies the routine exists and is still just
the pointer; the executor's mount-side probe observes `CCR_ROUTINE_TOKEN` emptiness; the
converge's fire observes the routine's response. A canon change that genuinely requires
console action becomes a per-member needs-attention item, never a silent degradation.

## Observability: terminals, the needs-attention issue, the enforcer

Every run ends in one of five uniform terminals: `current` | `delivered` | `pending-review` |
`blocked` | `needs-human`; a run that delivered nothing can claim `current` only by verifying
currency against content. Per member, everything is member-recorded: the stamp, the standing
delivery PR, and one labeled needs-attention issue (`claudinite:needs-human`) whose body always
carries the observation, the enumerated causes (never one inferred cause), the awaited action,
what breaks while it stands, and what closes it. Its age is the escalation signal, and a member
carrying one still accepts every delivery that does not require the human step — per-unit skips
make partial delivery expressible. Four operator-readable conditions per member, no sessions or
run logs needed: **delivered** (stamp `canon` = `fleet-current`, no open delivery PR, empty
owed set), **in-flight** (open delivery or skeleton PR / `pending-review`), **owed** (stamp
behind with no open PR, last terminal `blocked`, or a non-empty owed set older than a cycle),
**needs-a-human** (the labeled issue exists).

The fleet enforcer repo owns the member list — the canon holds no repo list and no per-member
state — and its contract is:

- **Report**: windowed comparisons — which members moved this window vs last, who is behind
  `fleet-current` and how long *since canon moved*, `fleet-current`'s own age against canon
  `main`, needs-attention items and ages, unit-keyed stuck signals, owed-skeleton ages. A
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
  issue with the observation — a broken scheduler skeleton is the one wedge whose inside
  cannot report, so "wake failed" is never just a log line.
- **Force sweep**: dispatch every member's scheduler with `force`, follow each run in parallel
  to its terminal, then read the stamps — the verdict is the stamps, never the dispatch (204
  means queued) and never run conclusions.

## Every member-hosted artifact, classified

| Artifact | Class |
|---|---|
| Mount tree (workflow bodies included), rules index, stamp | converged every pass (wholesale) |
| Workflow skeletons (scheduler, executor, per-pack) | computed and byte-verified every pass; written only by the sync lane — the routine's session on the converge's fire, any human session, install, adopt — and byte-checked back; the nightly never writes a workflow file; the owed set is derived, never recorded |
| Declaration, hook wiring, ignore/attr lines, `CLAUDE.md` import | converged every pass (surgical, per-unit isolated) |
| Badge row, seeded CI, starter local pack, pack declarations | written once where a decision happens (install, in-session adopt, or the enforcer-placed adopt task); member-owned after; drift and removal are by design |
| Member local packs, member source/tests/build config | never touched |
| Routine, its token secret, setup script | checked-and-reported (in-session check, mount-side probe, the converge's fire response, handover issues) |
| The canon's own two workflow copies | checked-and-reported: canon CI byte-compares them against the skeletons rendered for the canon itself |

No copied-once-and-unguarded artifact exists.

## Rationale

**One commit that carries its own claim.** The recorded fleet losses share a shape: content
separated from its claim, the claim advanced by a preparatory step, cleanup unable to tell
leftover from outstanding — #1545 is all three at once, five members losing content permanently
while every signal stayed green. One computed tree in one commit containing its own stamp
removes all three: no preparatory step, no deferred half for a hand-merge to orphan, the only
intermediate artifact (the branch) recreatable by construction. Multi-file git delivery is
otherwise a sequence of interruptible writes; shrinking the atomicity-needing part to one
commit buys the transaction git can give. The one write outside that commit — the skeleton —
is owed by derivation, not by claim: a hand-merge of either PR changes nothing the next night
cannot recompute.

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

**The workflow surface is made small and derived, and its one write is a credential, not a
judge.** An Actions job's `GITHUB_TOKEN` cannot push any ref that changes files under
`.github/workflows/` — GitHub refuses the entire push — and every credential that could is one
a member must hold. The design shrinks the surface to what GitHub forces into the file, so it
rarely changes; derives the owed set from content, so no claim can outrun it; and spends the
credential the member already holds for its task queue — the routine — on one fixed
instruction whose result is byte-checked. What silent dropping once cost (a fleet-needed line
stranded on 13 members, #1509) has no surface left to recur on: a skeleton the nightly cannot
write is a skeleton it reports and fires the sync for, every night until it is right. And a
member's workflows run from the member's own tree: the canon is an update-time dependency,
never a runtime one (alternative 12).

**One snapshot kills the compatibility matrix.** Engine, packs, skeleton templates, workflow
bodies and the delivery program arrive as one qualified ref, so no member holds a new engine
against old pack content or the reverse — the skew that froze the fleet for five days (#939),
and the unknown-key wedge where an old engine dropped every declaration in a file and failed
the gate that would have delivered the engine that knew the key (#1400), both become
unrepresentable. What remains is the skeleton generation seam, held additive forever, and
forward-tolerant readers everywhere: unknown input is reported and skipped per unit, never
fatal, never silently dropped.

**Skeletons are guarded because a scheduler that cannot fire silences its own repair.** A
member whose scheduler is broken neither converges nor accepts a dispatch — nothing inside can
report. Three guards: the skeletons are near-immutable (nothing behavioral in them, and every
write byte-checked against a render the canary already ran); the canary exercises every
template and body change before the fleet's snapshot moves; and the enforcer's failed-wake
escalation is the outside noticing what the inside cannot.

**Migrations dissolve — the engine's and the packs' alike; decisions stay where decisions
happen.** The record format, its registry, the `appliesTo`/`legacyPresent` predicates, the
applied-list in the stamp and the landed-date window all go, and a check that once asked
whether a migration was still active asks the normalizer whether its rule is still live. Every
coded transformation of member state falls to: wholesale mount recomputation, mount-hosted
workflow bodies behind thin skeletons, or the declaration normalizer — whose accretion is
bounded by enforcer-read retirement conditions, and whose rename map is permanent anyway,
since readers must map every legacy spelling regardless. What must *not* dissolve into
standing convergence is the pack-entry write: re-derived nightly it would relitigate an
owner's removal forever, so pack entries are written only by the acts that carry a decision —
install, an in-session adopt, an enforcer-placed adopt task — and the converge never touches
them. With ordering gone (no delta sequence exists, only current→desired), the ordering-tie
class — a same-day equality once skipped a change forever, #330 — has nothing to tie on.

**Updates are deterministic; judgment lives outside them.** Sessions are the expensive,
unreliable actor: for a period every mechanical change bought a model session on every member
(#798), and one night the same instructions made eight members deliver and five park. Keeping
judgment out of the delivery path removes that whole failure family from updates — and removes
the done-ness ledger a dispatch lane would need, the one bookkeeping that could again outrun
its artifact. The sync lane is a session but not a judgment: the instruction is fixed, the
render is pure, the diff is checked, and its failure delays one rare write rather than any
delivery. What replaces same-cycle dispatch is a better signal: a check finding re-derives
itself from the member's content forever, so a repair need is never lost, only pending — and
when pending is not good enough, the enforcer places the work as a task the member runs itself,
reviewed at the member.

**Observability is artifacts, not run conclusions.** Run conclusions are proven liars in both
directions — "done" recorded while delivery sat parked, a green fleet sweep over missing
content. The stamp, the standing PRs, and the one labeled issue are the queryable surfaces; five
terminals keep every non-green end the same shape; windowed reporting with absences named keeps
fleet numbers honest.

## Alternatives considered

1. **A writable member workflow surface via a per-member minted credential** (a write deploy
   key or a fine-grained PAT held as a repo secret). Lets the nightly push workflow bytes
   directly, but every member must hold a standing credential that widens what its automation
   can write — with provisioning at install, a revocation/rotation story, and a per-member
   secret whose absence is one more degraded mode. Rejected as a direction: the routine the
   member already holds is credential enough for a write this rare.
2. **Stage workflow content in-tree; a credentialed agent session lands it.** Splits delivery
   into a mechanical half and a deferred half with a staged copy and a claim: a hand-merge
   between them orphans the staged content, the claim outruns the delivery, and cleanup cannot
   tell leftover from outstanding — the #1545 interleaving class. The sync lane differs in
   every load-bearing part: no staged copy (the render is recomputed from the mount), no claim
   (the owed set is derived), no ledger, and an instruction with no decision in it.
3. **Full workflow bodies materialized member-side.** Every logic change, secret addition, or
   permissions change becomes a skeleton write through the sync lane; thin skeletons make that
   write the rare exception instead of the nightly rule.
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
12. **Canon-hosted reusable workflows called cross-repo from permanent member shims.**
   Field-verified to work (2026-09-01/02, ClaudiniteCanary `shim-probe` runs, #1547) and
   rejected: it makes the canon a *runtime* dependency of every member's scheduler and release
   pipeline. A repo is a standalone unit, and a package-manager repo is reached at install
   time, never at run time; a canon outage, a moved ref or an Actions-policy change would stop
   every member's queue at once, `secrets: inherit` pins the fleet to one owner, and the
   fleet's own supervisor holds no such coupling either.

## Open decisions

1. **Canary coverage.** Packs the canary does not declare are qualified by fixtures and
   workflow-YAML checks only. Recommendation: have the canary declare the widest safe superset;
   add a second canary in an affected family only if a fixture-blind breakage actually ships.

## Needs verification

1. **Private-repo behavior** — some or all members are private: verify the scheduled-workflow
   auto-disable policy there, dispatch against a disabled or unparseable workflow
   (enable-then-dispatch and the failed-wake escalation are correct under every answer), and
   budget the Actions minutes the converge spends.
2. **The routine's second payload class** — the tracked instructions file today handles one
   payload shape (an item and a nonce); the sync payload (a snapshot sha) is a second class the
   instructions must recognise and route to the script with no other action. Verify on the
   canary once the instructions land: fire, session, skeleton PR, byte-check, merge.
