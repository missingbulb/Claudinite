# Update flow — design

Canon changes reach the fleet through **the converge**: a nightly, per-member reconciliation of
the member's tree against a desired state computed from one qualified canon snapshot, delivered
as a single commit on a single PR whose content includes its own record of delivery. A per-repo
deploy key minted at install lets the cheap Actions lane push everything, workflow files
included. The flow is entirely deterministic — no model runs anywhere in it; judgment reaches
members through three lanes outside it (standing check findings, enforcer-placed repo tasks,
and a Shepherd-guided supervised process for fleet-wide breaking changes). There are no
one-shot migration records, no staging areas, no per-pack versions: the unit of delivery is the
whole snapshot.

## One qualified snapshot: `fleet-current`

`fleet-current` is a branch ref in the canon, protected fast-forward-only, advanced only by
qualification. It names the one canon commit the fleet converges to; its history keeps every
fielded snapshot fetchable (the deletion rule needs that); its FF-only protection holds
"members only move to descendant snapshots" in one place instead of one guard per member.
Everything a member runs — engine, packs, rules index, and the delivery
program itself (`delivery/run.mjs` and helpers; the entry-point path is a stable contract,
shimmed if it ever moves) — is content of that snapshot. Members run no resident copy of the
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
2. The two scheduling stubs, rendered per member. The **scheduler** stub carries the hashed
   cron minute (repo full name + `dailyHour` anchor) and no task secrets; the **executor** stub
   is stamped with the statically-named secrets its declared tasks and endpoint config require
   (Actions passes only secrets named literally in workflow YAML), plus a probe step (below).
   Both carry one static `CLAUDINITE_VARS: ${{ toJSON(vars) }}` line so new non-secret knobs
   never need a workflow change; the `toJSON(secrets)` shape is never emitted — GitHub's
   malicious-workflow detection parks runs carrying it behind a human "Approve and run" click.
3. Pack-owned files in member `.github/` beyond the stubs — release-pipeline workflows and
   composite actions for declared packs (GitHub resolves them only from a repo's own
   `.github/`), kept byte-current forever.
4. The stamp's `canon`/`at` fields — included only when something else differs or `S`
   moved, so a current member yields a byte-empty diff, not a nightly timestamp commit.

**Deletions** derive from two pure computations, never recorded bookkeeping: candidates are
`paths(desired(stamp.canon, member))` — widened to the union over all canon packs, so a
since-undeclared pack still yields its leftovers — minus `paths(desired(S, member))`. A
candidate is deleted only when its on-disk content byte-matches the old snapshot's render for
this member: literal proof of canon authorship before any destruction; a non-matching candidate
stays, reported as an advisory. Unknown or unfetchable `stamp.canon`: delete nothing outside
the mount root, orphans become advisories. (Inside the mount root no proof is needed — that
root is wholesale canon-owned.)

**Normalization** (member-owned files; surgical, idempotent, preserving everything not named):

5. `.claudinite-settings.json`: apply the permanent rename map (every legacy spelling straight
   to the current one — one map, no chaining), reshape legacy structures, seed absent required
   *config keys* with defaults — seed-never-override: an existing value, interview answers and
   reviewed accepts above all, is never rewritten. **Pack entries are never written here**: the
   declaration's pack list is the member's decision, written only where a decision happens —
   install, an in-session `adopt-pack`, or the enforcer-placed adopt task (below) — so the
   converge neither adds nor removes a pack entry and an owner's removal is durable, never
   relitigated. A declared pack id the rename map
   cannot resolve is skipped and reported, never dropped, never fatal. Edits are anchored-text,
   never a re-serialize. A missing or unparsable declaration on a stamped member is a
   needs-human state and no convergence — least of all a destructive one — runs against it:
   that shape is evidence of damage, not a pack-less member.
6. `.claude/settings.json` hook wiring: set-union — add missing required hooks, never remove or
   clobber member entries; the parse this requires makes the converge the harness-independent
   detector for an unparsable file (skip the unit, report it). `.gitignore` lines,
   `.gitattributes` entries, the one `CLAUDE.md` import line: add-if-missing.

**Per-unit isolation**: one throwing normalizer rule or unreadable
member-owned file skips exactly that unit, reports it by identity, and delivers the rest; a
unit skipped beyond a cycle is a stuckness signal keyed to the unit, not the member.
**Retirement is read off the fleet**: a normalizer rule or rename-map entry may carry a
retirement condition — "the enforcer's report shows no member recorded below snapshot X for a
full converge cycle" (dormant members included; their stamps stay readable) — and is removed
only when it reads true.

**Never in `desired`,** hence structurally untouchable by any converge: member source, tests,
build config, local packs, README content, the one-time install seeds, console state. That is
the build-safety guarantee's strong form — a nightly cannot break a member's own build because
the surfaces that build it are not writable by the converge at all.

## The stamp: `.claudinite/state.json`

```json
{
  "format": 1,
  "canon": "<sha>",   // snapshot this tree was computed from — written by the delivery commit itself
  "at": "<iso8601>"   // when that computation ran
}
```

`canon`/`at` are written only inside the delivery commit they describe: claim and content are
one atomic ref update. The stamp is the cheap query surface and nothing more — no
delivery decision trusts it over content — and is read-side tolerant forever: unknown keys
preserved and reported, legacy formats mapped, a missing or unparsable stamp meaning "unknown —
converge by content, write a fresh one", never "version zero".

## The resident shell: two stubs

The **scheduler stub** (`.github/workflows/claudinite-scheduler.yml`): one hashed cron plus
`workflow_dispatch` inputs `force`, `override-gate` (free-text reason; empty = none),
`canon-ref` (operator aiming; default `fleet-current`). Its delivery job: checkout self →
resolve `S` via `git ls-remote` → shallow-clone the canon at `S` →
`node <canon>/delivery/run.mjs` with the repo full name, the inputs,
`CLAUDINITE_STUB_CONTRACT: 1`, and exactly three values: `GITHUB_TOKEN`, `CLAUDINITE_PUSH_KEY`,
`CLAUDINITE_VARS`. Task secrets and the routine token never enter this job — it executes code
fetched from the canon at run time, and handing it task secrets would widen a canon compromise
to every member secret nightly. A failure job escalates any red run into the member's
needs-attention issue. The converge runs here before, and independent of, the task-queue drain
the stub also hosts — a broken queue must not block delivery of its own fix.

The **executor stub** hosts the queue's label-event work, is the one place stamped task-secret
names appear, and carries the secrets-emptiness probe: a step in the work job (which
legitimately holds the secrets) observes which stamped names arrived empty and opens/updates
the needs-attention item with the observation ("the workflow passed `FOO` and it was empty"),
never an inferred cause. Its whole stamped surface is derived from the member's declared task
set — the statically-named secrets and the `permissions:` grants the tasks' work requires
alike — so a task needing a new scope re-renders the stub instead of passing a fixed-shape
check and discovering a 403 at runtime.

The shell is deliberately too small to be wrong; everything changeable lives canon-side. The
one unavoidable skew is the stub's own one-merged-PR lag, so `run.mjs` accepts every stub
contract generation ever fielded — `CLAUDINITE_STUB_CONTRACT` says which arrived, evolution is
additive, a seam is never removed while any member can still hold a stub naming it. Because a
broken scheduler stub kills the very cadence that repairs stubs, stubs get two dedicated
guards: per-member write-validation before every push, and one-cycle-deeper qualification.

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
   - **Write-validation**: everything about to be pushed is validated as an artifact, per
     member — YAML-parse both rendered stubs and every written workflow, assert the scheduler's
     cron parses and its `workflow_dispatch` trigger and `run.mjs` invocation are present,
     JSON-parse every written JSON file. The only layer that catches member-varying render
     breakage no canary can see; a failure blocks the push — the one thing that must never ship
     is a scheduler that cannot fire.
   - **The load gate, three-valued on the delta**: run the same loader against the replaced
     tree (on disk at checkout) and the computed tree; compare failure sets. *Better* →
     deliver. *Same-broken* (identical nonempty sets — the member's own content breaks the
     load, tonight and every night) → deliver, and escalate the standing failure to the
     needs-attention issue: canon content keeps flowing to a member whose fault the canon
     cannot fix. *Worse* (the delivery introduces failures) → `blocked`, the delta as the
     observation. `override-gate` forces past *worse*, per-invocation, reason landing in the PR
     body — never a stored default.
   - The loader takes an explicit root argument and never inherits its root from the
     environment — the gate must be incapable of auditing the wrong tree. The converge also
     age-checks the hook lane's recorded heartbeat (the hook log): code-work checking the hook
     lane from outside it, because a detector must not ride the thing it detects.
5. **Diff** against the working tree. Byte-empty → `current`, a *verified* statement ("tree
   matches the computation at S") — the only kind of success this system reports. GC: a
   delivery branch whose content is already on `main` is provably leftover — delete it, close
   its PR saying why. Nothing is GC'd by age.
6. **Push** the delivery commit on the standing branch `claudinite/delivery` (recomputed from
   `main` and force-pushed every run — derived state, never accumulated), with the deploy key.
   If the key secret is empty or the push rejected: a diff touching nothing under
   `.github/workflows/` goes via `GITHUB_TOKEN` (an Actions token may push anything except
   workflow-file changes — GitHub refuses the whole ref otherwise); a workflow-touching diff
   ends `needs-human` — observation ("push rejected: <error>"), enumerated causes (key secret
   empty, deploy key removed, branch protection), awaited action (re-mint per the install
   runbook), what breaks meanwhile, closing condition. The owed content is loudly recorded; the
   next run re-derives it in full.
7. **Open-or-update the PR** (`GITHUB_TOKEN` API): body carries `computed-from: S`, the diff
   summary by class, override traces, unknown-state notices, per-unit skips. One standing PR;
   every delivery is a reviewable diff in the member's own repo. A PR-creation refusal is a
   needs-human observation whose enumerated causes include the repository setting that gates
   Actions-created pull requests.
8. **Merge per the member's recorded preference.** Auto-merge: fast-forward push of the branch
   head to `main` — built on `main` this run, so FF holds unless `main` moved; then rebuild and
   retry once or twice in-run, else defer to the next run. GitHub marks a PR merged once its
   head is reachable from base, so no merge-API call is needed. Branch protection applies to
   the key like any actor; rejection ends `pending-review`, the observation distinguishing
   "recorded preference says auto-merge but protection contradicts it" from genuine
   hold-for-review. Hold-for-review members stop at `pending-review`; the human merges.
   **Cascade semantics differ by lane and are part of the contract**: a deploy-key push is a
   real-credential push — branch force-pushes fire `pull_request: synchronize` on the standing
   PR (minutes noise, read by nothing in the verdict path), and the FF merge fires the member's
   own `on: push` workflows, releases included, exactly as a human merge does. A `GITHUB_TOKEN`
   push fires nothing (GitHub suppresses cascades from Actions-token pushes), so on the
   degraded lane push-triggered member workflows stay silent on delivery merges — and the
   degraded lane's needs-attention text says exactly that.
9. **End** `delivered`.

A crash between any two writes leaves: nothing, a branch, or a branch+PR — every prefix inert
or rebuilt from scratch next run; no claim is ever advanced early, because the only claim lives
inside the merge itself. And `converge(converge(member))` writes nothing.

## Qualification: the canary and the advance

Canon CI qualifies every change at fixture level (suite, engine/mount self-test, stub-render
rehearsal). One real member qualifies every snapshot the fleet takes: the **canary member**
declares `canonRef: "main"`, so its converge exercises the full real path — compute, validate,
gate, push, PR, merge, load — against canon `main` first. After a green terminal, the same run
advances `fleet-current` to the sha it verified, pushing with `CLAUDINITE_CANON_TOKEN` (a
secret held by the canary alone, minted at its install); FF-only protection makes a
non-descendant advance impossible.

**Stub-touching snapshots qualify one level deeper**: the advance additionally requires that
the stub this canary run *executed under* (the on-disk workflow at checkout, pre-converge)
already byte-equals the stub `S` computes for the canary. A snapshot changing the scheduler
stub delivers it to the canary without advancing; the next canary run — the first to actually
fire under the new stub — advances. One extra day of latency, only for stub-touching changes;
"the member can still receive the next update" is exercised, not assumed.

The advance is non-vacuous: it records the canary run id and delta size, and an empty-delta
verification advances with "verified current at S — no member-visible delta". On red,
`fleet-current` stalls — the fleet keeps its last good snapshot — and the canary opens a canon
issue "qualification red at <sha>: <observation>" with the same token. The stall is loud twice:
that issue, and the enforcer's named canary-down condition. Urgent-fix runbook while the canary
is down: per-member `canon-ref: main` dispatch (aimed, traced), or an operator FF of
`fleet-current` by hand after verifying — per-invocation acts, never stored defaults.

**Coverage caveat**: the canary qualifies what it declares. Packs it does not declare — release
pipelines above all — are qualified by fixture renders and write-validation only, so a semantic
breakage there ships canary-blind to exactly the members it affects (open decision 3).

## Install and pack addition

First contact runs in an interactive, human-present session via `delivery/install.mjs` — the
one moment a person is reliably there. It refuses a repo already carrying a stamp or mount (the
converge is what brings an existing member current; seeds and interview answers are never
relitigated), then: the batched interview, answers recorded verbatim; the same converge
computation at `fleet-current`, in-session — the session's human/app credential writes
workflows freely, and the member gets the newest shape directly, nothing replayed because
nothing exists to replay; the **seeds**, here and only here (and at `adopt-pack` for a newly
declared pack's) — the README badge row, a minimal CI workflow only where the repo has none,
the starter local pack — the converge has no seed code path, so "never re-applied" is
structural; **credential
provisioning** — generate a keypair, create the write deploy key and the `CLAUDINITE_PUSH_KEY`
secret via API under the present human's authority, and enable the repository setting that
lets Actions open pull requests (the converge's PR step depends on it), anything the session
cannot do becoming a handover checkbox, and re-minting is delete-then-recreate (remove any
existing delivery key and secret, then create both) so an orphaned half-provisioned pair can
never block it; the routine,
with endpoint config naming the secret's *name* only; **the handover issue** — one, a checkbox
per human-only step, each with what breaks while undone and what closes it: mint
`CCR_ROUTINE_TOKEN` into the repo secret, finish the routine's console binding, paste the
web-environment setup script, plus any provisioning step the session could not perform.
Finally the stamp: `canon` = the install snapshot.

Pack addition (`adopt-pack`, in-session) is the declaration entry, that pack's interview and
seeds, then the same converge. A declared pack that adds a required question in a later
snapshot: the converge never guesses and never asks — it lists the unanswered questions in the
needs-attention issue; pack content still delivers; the member's next human session answers.
Fleet-driven addition — the fleet manager deciding a pack belongs in members that already
run — arrives as an enforcer-placed adopt task per member (next section), never as a
converge-side write.

## Adaptation: judgment never rides the update flow

The update flow summons no session, ever. When changed rules meet member-authored content the
canon has never seen — a rename whose other spellings live in member prose, a local pack built
against a retired contract, tests a new rule turns red — the repair reaches the member through
three lanes, none of them part of a converge:

- **A standing check finding, shipped with the change** (the default). The author of a rule
  change that meets member-authored content ships, in the same pack version, the check that
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
  touch every member's member-owned surfaces at once is run by an actor with fleet-wide access
  executing a code-plus-agent script over the fleet under manual guidance, pilot first — never
  by the unattended nightly.

Credential work is not judgment and belongs to none of these lanes: the deploy-key lane owns
it, and no session is ever summoned for it (#1296: "the reason it is agentic is the
credential, not the decision").

**Out-of-GitHub state** stays content-thin: the routine's stored prompt is one pointer line at
a vendored file, so console state almost never changes and content changes ride the pointed-at
file. No update path depends on the routine — it serves the task queue only — so its breakage
delays placed tasks, never delivery. Verification uses the only contexts that can see each
half: a standing in-session check — any session in the member — verifies the routine exists
and is still just the pointer; the executor's probe observes `CCR_ROUTINE_TOKEN` emptiness. A
canon change that genuinely requires console action becomes a per-member needs-attention item,
never a silent degradation.

## Observability: terminals, the needs-attention issue, the enforcer

Every run ends in one of five uniform terminals: `current` | `delivered` | `pending-review` |
`blocked` | `needs-human`; a run that delivered nothing can claim `current` only by verifying
currency against content. Per member, everything is member-recorded: the stamp, the standing
delivery PR, and one labeled needs-attention issue (`claudinite:needs-human`) whose body always
carries the observation, the enumerated causes (never one inferred cause), the awaited action,
what breaks while it stands, and what closes it. Its age is the escalation signal, and a member
carrying one still accepts every delivery that does not require the human step — the degraded
lanes and per-unit skips make partial delivery expressible. Four operator-readable conditions
per member, no sessions or run logs needed: **delivered** (stamp `canon` = `fleet-current`, no
open delivery PR), **in-flight** (open delivery PR / `pending-review`), **owed** (stamp behind
with no open PR, or last terminal `blocked`), **needs-a-human** (the labeled issue exists).

The fleet enforcer repo owns the member list — the canon holds no repo list and no per-member
state — and its contract is:

- **Report**: windowed comparisons — which members moved this window vs last, who is behind
  `fleet-current` and how long *since canon moved*, `fleet-current`'s own age against canon
  `main`, needs-attention items and ages, unit-keyed stuck signals. A member it cannot read is
  named absent, never guessed; no cumulative totals; no point-in-time stamp read as a window.
- **Skew findings double as delivery probes**: a member that converged and still reports an
  unplaceable key did not actually move — a verification signal independent of both stamp and
  run conclusion.
- **Canary-down is a named condition**: "fleet-current has not advanced in N days while canon
  moved", beside the per-member rows, with the urgent-fix runbook line.
- **Wake**: a member whose stamp stopped moving while canon moved beyond a bound gets
  API-enable of its scheduler workflow (GitHub disables scheduled workflows after 60 days of
  repo inactivity; enable-then-dispatch is correct whether or not dispatch works while
  disabled) and a dispatch. **A failed wake escalates immediately** into that member's
  needs-attention issue with the observation — an unparseable scheduler is the one wedge whose
  inside cannot report, so "wake failed" is never just a log line.
- **Force sweep**: dispatch every member's scheduler with `force`, follow each run in parallel
  to its terminal, then read the stamps — the verdict is the stamps, never the dispatch (204
  means queued) and never run conclusions.

## Every member-hosted artifact, classified

| Artifact | Class |
|---|---|
| Mount tree, rules index, stamp | converged every pass (wholesale) |
| Two stubs, pack-owned `.github/` files | converged every pass (rendered; deletions proven against the old snapshot's render) |
| Declaration, hook wiring, ignore/attr lines, `CLAUDE.md` import | converged every pass (surgical, per-unit isolated) |
| Badge row, seeded CI, starter local pack, pack declarations | written once where a decision happens (install, in-session adopt, or the enforcer-placed adopt task); member-owned after; drift and removal are by design |
| Member local packs, member source/tests/build config | never touched |
| Routine, its token secret, setup script, deploy key + secret | checked-and-reported (in-session check, executor probe, handover issues) |
| The canon's own two workflow copies | checked-and-reported: canon CI byte-compares them against the stub rendered for the canon itself |

No copied-once-and-unguarded artifact exists.

## Rationale

**One commit that carries its own claim.** The recorded fleet losses share a shape: content
separated from its claim, the claim advanced by a preparatory step, cleanup unable to tell
leftover from outstanding — #1545 is all three at once, five members losing content permanently
while every signal stayed green. One computed tree in one commit containing its own stamp
removes all three: no preparatory step, no deferred half for a hand-merge to orphan, the only
intermediate artifact (the branch) recreatable by construction. Multi-file git delivery is
otherwise a sequence of interruptible writes; shrinking the atomicity-needing part to one ref
update buys the transaction git can give.

**Decisions read the artifact, not the bookkeeping.** What to deliver is a tree diff; what to
delete is proven by byte-match against the canon's own historical render. A wrong recorded
claim cannot mask a gap anywhere — the
recovery that once had to be hand-built (#1546: content re-issued above a wrong claim, gated on
the destination's own content) is this system's ordinary nightly behavior.

**The gate judges the delta, not the state.** A single red/green verdict refuses the cure
whenever the patient is sick: a member whose own local pack is broken reddens every night's
gate, and canon content stops flowing for a fault the canon cannot fix — #939's five-day
all-green freeze is that shape (the red gate parked the very PR carrying the fix). Comparing
failure sets between replaced and computed trees makes "the fix can always arrive" structural:
only a regression the delivery itself introduces blocks. The double load costs seconds.

**Stubs are triple-guarded because their failure silences its own repair.** A member whose
scheduler cannot fire neither converges nor accepts a dispatch — nothing inside can report.
Per-member write-validation catches render breakage (including member-varying breakage no
canary can see) before any push; the executed-under advance condition proves next-run viability
on the canary before the fleet takes a stub change; the enforcer's failed-wake escalation is
the outside noticing what the inside cannot.

**A deploy key carries the workflow surface.** An Actions job's `GITHUB_TOKEN` cannot push any
ref that changes files under `.github/workflows/` — GitHub refuses the entire push — the one
credential gap in otherwise-free code-work delivery. Delivering workflow bytes is credential
work, not judgment (#1296), so it gets the cheapest credentialed lane surviving that refusal: a
per-repo write deploy key — no expiry, exactly one repository, mintable by API at install, the
one moment a human is reliably present. It dissolves the withhold/staging problem: nothing is
dropped (workflows ride the same PR as everything else — silent dropping once stranded a
fleet-needed line on 13 members, #1509); the content is reviewable (a PR diff, inert until
merged — workflow definitions take effect only from the default branch); a failed push leaves
only a recomputable branch; and there is no circularity — the key depends on nothing it
delivers (a member whose executor lacked its own token line could never start the session that
would have delivered it, #1296). Degradation is designed and its cascade difference named:
without the key, workflow-free diffs still flow via `GITHUB_TOKEN`.

**One snapshot kills the compatibility matrix.** Engine, packs, and the delivery program
arrive as one tree, so no member holds a new engine against old pack content or the reverse —
the skew that froze the fleet for five days (#939), and the unknown-key wedge where an old
engine dropped every declaration in a file and failed the gate that would have delivered the
engine that knew the key (#1400), both become unrepresentable. What remains is the one-cycle
stub lag, held additive, and forward-tolerant readers everywhere: unknown input is reported and
skipped per unit, never fatal, never silently dropped.

**Migrations dissolve; decisions stay where decisions happen.** Every coded transformation of
member state falls to: wholesale mount recomputation, the key lane's standing convergence of
member-hosted `.github/` content, or the declaration normalizer — whose accretion is bounded by
enforcer-read retirement conditions, and whose rename map is permanent anyway, since readers
must map every legacy spelling regardless. What must *not* dissolve into standing convergence
is the pack-entry write: re-derived nightly it would relitigate an owner's removal forever, so
pack entries are written only by the acts that carry a decision — install, an in-session
adopt, an enforcer-placed adopt task — and the converge never touches them. With ordering gone
(no delta sequence exists, only current→desired), the ordering-tie class — a same-day equality
once skipped a change forever, #330 — has nothing to tie on.

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

1. **Stage workflow content in-tree; a credentialed agent session lands it.** Splits delivery
   into a mechanical half and a deferred half: a hand-merge between them orphans the staged
   content, the claim outruns the delivery, and cleanup cannot tell leftover from outstanding —
   the #1545 interleaving class. Also prices credential work as model work and inserts session
   failure modes into the mechanical path. If both the deploy key and the PAT fail
   verification, the choice reopens between this shape as a narrow errand and workflow diffs
   parking `needs-human` for a person.
2. **Independently versioned units with one-shot migration records.** Costs the mixed-arrival
   compatibility matrix and its min-engine bookkeeping (#939, #1400), record ordering with
   tie-skipping hazards (#330), the record/registry/replay apparatus, and fetch-gates that
   wedge on exactly the content that would fix them; replay against a fresh repo is a hazard of
   its own, since records assume the shapes their era produced.
3. **A different workflow-surface credential.** A fine-grained PAT is user-tied and expires
   (historically ≤1 year) — rotation becomes recurring per-member human work, the kind that
   reliably does not happen; it is the fallback if the deploy-key verification fails and a
   no-expiry mint verifies. A GitHub App installation with the app key as a shared secret
   assumes one org owns the fleet and replicates one fleet-burning credential into every
   member.
4. **Push straight to `main`, no PR.** Delivery stops being reviewable in the member's own
   repo, and the per-member hold-for-review choice stops existing.
5. **Judge delivery by member CI, or qualify by fixtures alone.** Actions-token pushes fire no
   other workflows; GitHub can park a run behind an approval click unattended machinery can
   never press; fixtures test only what someone remembered to model. The verdict must be the
   delivery's own validation and gate, plus one real member.
6. **A recorded managed-paths list driving deletions.** One more bookkeeping format, and a
   hand-edited or badly-merged list becomes a delivery PR deleting member-owned files —
   destruction directed by a record instead of proof.
7. **A single-verdict red/green load gate.** Refuses the cure because the patient is sick
   (#939). The cheaper variant — gate canon content only, report member-caused red — kills the
   wedge but misses "canon change interacts badly with member config"; the double load is cheap
   enough to keep the full comparison.
8. **Blanket-permanent normalizer rules.** An unbounded legacy vocabulary every reader
   consults forever; per-rule retirement conditions read off the enforcer's report bound it
   with a converge-cycle-confirmable precondition.
9. **An agentic stage inside the update flow** — author-declared attention notes (or an apply
   stage) dispatched by the converge, with a completion ledger and canary-scoped pilots. Buys
   same-cycle repair, at the cost of a second dispatch mechanism whose actor parks, dies and
   drifts, pilot/scope machinery to bound its fan-out, and a done-ness ledger that
   reintroduces the claim-outruns-artifact gap unless every author also writes a destination
   probe — all for latency the finding and task lanes cover with no standing machinery.
10. **Converge-side pack seeding** — a fleet-seed flag plus a one-shot `seeded` memory in the
   stamp. Puts a member decision in the nightly's hands and adds the one stamp field a
   delivery decision would read; the enforcer already owns fleet intent, and its placed adopt
   task delivers the same outcome as reviewed member-side work.

## Open decisions

1. **Verification sequencing.** Run the deploy-key experiment before building; if it fails,
   choose explicitly between the fine-grained-PAT fallback's expiry maintenance and workflow
   diffs parking for a person (or a narrow staged errand). Recommendation: run it first — one
   scratch-repo hour, the keystone of the single-PR shape.
2. **Deploy-key rotation posture.** Blast radius is one repo; revocation is manual
   (delete-then-recreate re-mint). Recommendation: accept manual revoke; a rotation cadence
   re-creates recurring per-member human work.
3. **Canary coverage.** Packs the canary does not declare are qualified by fixtures and
   write-validation only. Recommendation: have the canary declare the widest safe superset; add
   a second canary in an affected family only if a fixture-blind breakage actually ships.

## Needs verification

1. **Deploy keys vs workflow files** (load-bearing). GitHub documents the `workflow`-scope
   refusal for OAuth/PAT pushes and describes write deploy keys as acting like an admin member,
   with no workflow-scope statement either way. Experiment, scratch repo: add a write deploy
   key; over SSH push commits that add, modify, and delete a workflow file; record what each
   push type fires (deploy-key branch push — expect `push` plus `pull_request: synchronize` on
   an open PR; deploy-key FF push to the default branch — expect `on: push`; `GITHUB_TOKEN`
   push — expect nothing); and whether required status checks run against deploy-key-pushed
   branches and gate the FF push under branch protection.
2. **Fine-grained PAT fallback** (only if 1 fails): workflow pushes under `Contents: write` +
   `Workflows: write`, and whether a no-expiry (or ≥1-year) mint exists.
3. **FF push marks the PR merged.** GitHub marks a PR merged once its head is reachable from
   base; confirm for a deploy-key fast-forward push. If it closes-without-merged, push a true
   merge commit of the head instead — same lane, same guarantees.
4. **`GITHUB_TOKEN` API-merge of a workflow-touching PR.** Not load-bearing (merges are FF
   pushes); settling it would collapse the merge step to one code path.
5. **Private-repo behavior** — some or all members are private: verify the scheduled-workflow
   auto-disable policy there, dispatch against a disabled or unparseable workflow
   (enable-then-dispatch and the failed-wake escalation are correct under every answer), and
   budget the Actions minutes the converge and the key lane's synchronize runs spend.
