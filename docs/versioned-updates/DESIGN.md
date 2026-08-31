# Versioned updates — design

Status: **agreed** (owner decisions recorded in §10; settled in the
2026-08-12 design conversation). Supersedes, once migrated, the unified
**baselining** task (`packs/basics/tasks/baselining/`) — its nightly
converge-everything-at-canon-head model, its date-held stamp, and its
four-condition agent escalation. The phased rollout is tracked as a
migration-plan issue (linked from the PR that lands this doc).

Terminology decision (owner): the mechanism is called **update** — engine
update, pack update, install. The words *baseline / baselining /
rebaselining / rebasing* retire with the task that carried them.

The shape: the canon splits into a **versioned engine** and **versioned
packs**, each with its own update flow. The engine update is fully
deterministic — no agentic stage, ever. The pack update keeps a bounded
agentic stage ("apply the new pack rules to this repo; repair what they
break") with one terminal escape hatch: any non-green end state leaves the
PR open, tagged `need-human`. Installing a pack is the same runner as
updating one, started from version zero.

---

## 1. Why the current mechanism has an agentic stage at all

The census (2026-08-12, this repo's full history — no migration record has
ever been deleted, so the population is complete): **three agentic notes
ever written**, across eleven migration records, plus three structural
escalation conditions in `worker.mjs`'s `escalation()`:

| Residual | Cause | Lands in |
|---|---|---|
| `pack-independence` note | engine composition contract | member local packs |
| `prework-rename` note | engine field rename | member local packs |
| `fleet-baseline-task` note | pack lever conversion | member `.github/workflows/` |
| `withheld-workflows` | credential (Action token cannot write `.github/workflows/`) | — |
| `selftest-failed` / `checks-not-green` | judgment: is a non-green converge safe to merge? | — |
| executor-routine verification | the CCR routine is invisible to Actions | — |

The lesson that shapes this design: the residuals split by **type**
(credential / judgment / member-content adaptation), not by which half of
the corpus changed. Two of the three notes were engine-caused but landed in
member-authored local packs the canon has never seen. So the split below
does not *eliminate* those types — it **relocates each to the one flow that
can absorb it**, and constrains the engine so its flow needs none of them.

## 2. The engine: versioned, cloned, never agentic

**The version format is date-anchored `<day>.<n>`** — `60820.1`, where the day
part is `(year - 2020) * 10000 + month * 100 + day` and `n` is the running
number of versions cut on that day. Engine and pack versions share it, and
`engine/version.mjs` owns the parsing, the ordering and the comparison every
flow below makes. It replaces a plain monotonic counter (2026-08-20, #1100):
the ordering the flows need is unchanged, and a version now says *when* it was
cut without a second lookup. Every reader accepts a legacy integer as well,
below every date-anchored version, until the fleet has re-stamped.

1. **The engine has running versions.** A release is a qualified snapshot
   (the live canary rehearsal runs against it once, per release, instead of
   the fleet discovering breakage per repo per night).
2. **The update procedure clones the engine release into the repo's mount**
   — wholesale replacement, as `compute-vendor-set` does today. The engine's
   own files never need migration; they are replaced.
3. **Engine migrations cover the member-owned files that reference engine
   surfaces** (hooks in `.claude/settings.json`, paths in local-pack code,
   the declaration file). They are **usually regex-replace rules, rarely
   code — never agentic** (owner decision). **The vendoring flow fetches
   only the migrations above the repo's installed engine version** (owner
   decision) — the version replaces today's date-based recency window
   (`recordDirIsRecent`) as the fetch predicate: an up-to-date repo
   vendors none, a lagging repo vendors exactly its gap. Because the same
   window currently also drives `migrationActive()` — the legacy-tolerance
   predicate consumer checks consult — that tolerance becomes
   version-based in the same move ("tolerate the legacy shape while
   installed version < N"), or checks would flag legacy shapes on repos
   that simply have not updated yet. The discipline this imposes on
   engine evolution is accepted and explicit: an engine contract change must
   either be mechanically expressible (regex or a small deterministic
   codemod shipped with the release) or remain backward-compatible, with the
   legacy shape accepted and normalized at load — the posture
   `prework-rename` already took. A contract change that satisfies neither
   **does not ship** until it does. There is no agentic lane to fall back
   on, by construction.
4. **The engine update does not write `.github/workflows/`.** The rare
   engine change that must touch a workflow file ships as a **custom
   update** — an explicitly named, separately credentialed operation (the
   Action token structurally cannot write there; the custom update runs
   under an MCP-credentialed session or a human). Naming it keeps the lane
   from becoming an invisible agentic side door.
5. **The engine update merges its PR to main automatically**, gated on the
   converged tree passing `selftest --strict` — the gate that exists because
   of #555, where an engine change silently stopped every consumer pack from
   validating while content checks stayed green. On a red self-test the PR
   stays open, tagged `need-human`. A **`force-merge-on-red-ci`** option
   (owner decision) overrides the gate for the operator who has judged the
   red acceptable — an explicit per-invocation flag, never a stored default.

## 3. Packs: versioned, deterministic core, bounded agentic tail

6. **Each pack has a version**, in the same date-anchored format, and **each pack version declares the
   minimum engine version it requires**, enforced by the updater: a pack
   update never applies past the installed engine (§5). This is what makes
   the split coherent — the current single-snapshot guarantee ("the set and
   the content can never come from different snapshots") is replaced by a
   *checkable* compatibility constraint rather than dropped.
7. **A pack update is deterministic first**: vendor the new pack version,
   run its version-ranged migrations (vN→vN+1, in order), converge wiring.
   **Pack migrations live in the pack's own `migrations/` folder** and are
   fetched by the same version gate as the engine's (owner decision): only
   the records above the repo's installed version of *that pack* ship in
   the mount. The flat canon-wide `migrations/` directory does not survive
   the split — each record moves to the flow (engine or pack) that owns it.
   **Workflow churn belongs to the pack flow, explicitly** (owner decision):
   the scheduler workflow's content is a function of the *task set*
   (`declaredSecrets` unions `required_secrets` across discovered tasks), so
   pack changes are what rewrite it, and the pack flow carries the
   credential to land those files — the MCP lane baselining's agent stage
   uses today, §2b of its task.
8. **A pack update may carry an agentic stage**: "apply the new pack rules —
   fix the repo, repair the tests." This is the one place agentic work
   survives, because it is the one residual no mechanism can absorb: the
   pack's new rules meet member-authored content the canon has never seen.
   The stage also inherits the orphaned **executor-routine verification**
   (the CCR routine that fires on `ready-for-agent` is not a GitHub
   artifact; only an agent session can see it, and this is the only agent
   lane left).

   **The word is *may*, and the RECORDS are what decide it** (#798). A pack
   record declares `applyStage: { why, instructions }`; an update whose gap
   holds no such record is delivered without a session. The first
   implementation asked the version plan instead — "any declared pack whose
   version moved" — and that is a fact about the *canon* where the stage
   needs a fact about the *member*. Because a record can only reach an
   up-to-date member if its pack's manifest bumps (§3.7), and every bump
   summoned a session, **a purely mechanical migration could not be shipped
   without spending an agent session on every member in the fleet**. The
   record's author knows which of the two kinds they wrote; a version number
   never can. An **install** stays unconditional (§4) — that genuinely is
   first contact.
9. **The pack update merges its PR to main** unless it ends non-green.
   **Every** non-green terminal — unanswered interview questions, an agentic
   repair that leaves checks red, a migration that could not complete —
   ends the same way: the PR stays open, the dispatch issue is tagged
   `need-human`, the run stops. Interviews are one instance of the rule,
   not the rule.

## 4. Install = update from version zero

Installing a pack is the pack updater started with no prior state: vendor,
converge, agentic apply, deliver — the same flow, same terminals (§3.9:
interview unanswered → PR open + `need-human`). **An install runs no
migrations** (owner decision): the vendored pack content is already the
newest shape, so there is no older state to migrate — replaying history
onto a fresh install is both wasted work and a correctness hazard
(migrations assume the shapes their era produced, not an empty repo).
The install stamps the pack's **latest** version directly; migrations are
exclusively for repos that were installed at an older one. Two
install-specific provisions:

- **One-shot seed ops.** Some install effects are seeded once and owned by
  the repo thereafter (the README badge row is the existing precedent:
  seeded by `--badges` at adoption, never re-converged, precisely so
  updates cannot rewrite a member's README). The install carries an
  **initial migration** — ordinary code the runner executes, not a "real"
  migration — and the mechanism marks these ops *run-once-at-install*.
  The updater must never re-run them; the distinction between *seeded*
  (repo-owned from then on) and *converged* (rewritten every update)
  surfaces is load-bearing.
- The interview happens through the same open-PR + `need-human` terminal,
  which degrades gracefully to async — better than today's adopt-pack
  skill, which needs a live session.

## 5. Invariants

- **No agentic work in the engine flow.** Ever. The escape hatches are the
  named custom update (workflows) and the `need-human` terminal (red
  self-test) — both visible, neither a model.
- **Version-ranged migrations replace the date stamp.** "Which migrations
  apply" becomes "installed version → target version," retiring the
  held-stamp subtleties (#329, #330). The same range gates **fetching**:
  a mount carries exactly the migration records in its gap, none on an
  up-to-date repo, and a fresh install carries — and runs — none at all.
- **Compatibility is enforced, not assumed**: pack min-engine-version
  checked before apply; violation is a `need-human` terminal, not a guess.
- **Every non-green terminal looks the same**: PR open, `need-human`,
  stop. No flow merges red — except the engine's explicit
  `force-merge-on-red-ci`, which is an operator's signed judgment, not a
  flow default.
- **A repo that reports a clean update is clean.** The withholding pattern
  (paths silently dropped from a push, forever) does not survive: what a
  flow cannot write, it either hands to the flow that can (workflows → pack
  lane / custom update) or surfaces as `need-human`.

  **The lane is live (#1509).** It was retired in #1317, on the premise that a
  member's two workflow files are static after adoption; #1494's executor line
  is the counterexample, and the lane reopened to carry it. What the principle
  forbids has never changed — a flow may not silently drop a path it cannot
  write. The lane:

  the pack flow **staged** `.github/workflows/`
  content at `.claudinite/pending-workflows/` — a path its Action token
  *can* push — and ended at `apply-stage` until a session with an MCP
  credential moved it into place. Three properties, and the design needs all
  three: nothing is dropped (the update does not report clean while owing a
  file), the content is **reviewable** (it lands in the update's own PR diff,
  where a human sees the workflow change before any session touches it), and
  it is **recoverable** (a session that never ran leaves the content on the
  branch rather than losing it with a request file). The staging directory is
  swept every cycle, so it is empty exactly when nothing is owed — which is
  also what makes "did the apply stage actually run" a question with an
  answer (#797, #649).

## 6. What this retires

- The `baselining` task (task.md, task.mjs, worker.mjs), its escalation
  codes, and its dispatch-issue protocol.
- The `agentic:` field on migration records: engine migrations may not
  carry it at all; pack migrations express agentic work as the pack
  update's apply stage instead, by declaring `applyStage: { why,
  instructions }` (§3.8). What the successor drops is the **model** knob —
  which model runs a session is the scheduler's answer, off the task
  declaration, and a record naming its own was a second authority over the
  same fact.
- The date-held stamp (`claudinite.updated` gating note application) — deleted
  outright in #1252, along with the `claudinite` block that held it: it recorded
  the last FULL re-vendor rather than the last converge, so nothing could judge
  freshness by it correctly.
- The baselining vocabulary, corpus-wide.

## 7. Known-open

- The `local-pack-namespace` declaration rewrite (bare id → `local/<id>`)
  remains unowned; the versioned scheme should place it in an engine
  migration (it is a regex on the declaration file — squarely within §2.3).
- Escalation-frequency measurement across the fleet (which `escalation()`
  codes actually fire) would validate the split's cost model; nice to have
  before Phase 2, not a blocker.

## 8. Propagation and session access

**Member repos change nothing by hand, and their local packs change not at
all.** Local packs are repo-owned, not distributed: under this scheme they
get no version numbers, no `migrations/` folders, and no install flow, and
the cutover never rewrites them. The one indirect touch is
`migrationActive()` tolerance moving from date-based to version-based —
shipped together with the fetch gate (§2.3) so a lagging repo's local
packs keep their legacy-shape tolerance until that repo actually updates.
A local pack's adaptation remains what it is today: a conformance finding
resolved in the repo's own sessions, never a step of this migration.

The member-side deltas the migration does produce are all written by the
flows themselves: the installed versions recorded in the member's settings
file (the engine version, and each pack's version on that pack's own entry
since #1252), the relocated migration records inside the vendored mount, and
eventually the new worker.

**Implementation happens in the canon repo alone** — no fleet-scoped
session is required. The propagation channel already exists and is
self-carrying: the vendored worker shallow-clones fresh canon every cycle
and executes the *cloned* canon's vendoring, wiring, and migration
scripts as subprocesses, never its own stale copies (worker.mjs:14–25,
51–54). New vendor-set logic, the per-pack migration layout, and the
version gate are live fleet-wide the night after they land in canon;
changes to the worker/driver itself lag exactly one cycle (vendored in
cycle N, executing in N+1). Three caveats, none requiring fleet access to
implement:

1. **Scheduler workflow stub changes** land per-repo through the existing
   agent lane (baselining §2b's MCP credential; the pack flow's lane after
   Phase 2) — automatic, during each repo's own cycle.
2. **The CCR executor routines** are the one per-repo artifact outside
   GitHub's reach. Their prompt is a thin pointer to the vendored
   `executor.md`, so content changes ride the mount; only a change to the
   dispatch *wiring* (label name, model, launcher prompt) would need
   per-repo trigger-API access. The rollout should avoid requiring that —
   or accept the bootstrap-Part-6 owner-issue path where it cannot.
3. **The fleet-wide cutover verification** (Phase 5's precondition) is
   fleet-scoped, but it belongs to the sheepdog enforcer's existing fleet
   tasks — machinery, not an implementation session.

## 9. Migration

Phased rollout tracked in the migration-plan issue (filed alongside this
doc). Summary: version scaffolding first (no behavior change), then the
engine flow, then the pack flow, then install, then retirement of
baselining and its vocabulary.

## 10. Owner decisions recorded

1. Engine auto-merge is selftest-gated, **with a `force-merge-on-red-ci`
   override** (2026-08-12).
2. Workflow churn is **explicitly the pack flow's** (2026-08-12).
3. Engine migrations are "usually regex, rarely code" — **no agentic work
   on the engine, ever** (2026-08-12).
4. `need-human` covers **all** non-green terminals, not only interviews
   (2026-08-12).
5. Pack versions **declare and enforce** a minimum engine version
   (2026-08-12).
6. The mechanism is named **update**; baselining vocabulary retires
   (2026-08-12).
7. Migration fetching is **version-gated**: vendoring ships only the
   records above the repo's installed version — engine and pack alike —
   replacing the date-based recency window (2026-08-12).
8. Pack migrations live in **each pack's own `migrations/` folder**; the
   flat canon-wide directory retires with the split (2026-08-12).
9. **An install runs no migrations**: the vendored content is already the
   newest shape, and the install stamps the latest version directly
   (2026-08-12).
