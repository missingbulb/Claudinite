# Versioned updates — design

Status: **agreed** (owner decisions recorded in §9; settled in the
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

1. **The engine has running versions.** A release is a qualified snapshot
   (the live canary rehearsal runs against it once, per release, instead of
   the fleet discovering breakage per repo per night).
2. **The update procedure clones the engine release into the repo's mount**
   — wholesale replacement, as `compute-vendor-set` does today. The engine's
   own files never need migration; they are replaced.
3. **Engine migrations cover the member-owned files that reference engine
   surfaces** (hooks in `.claude/settings.json`, paths in local-pack code,
   the declaration file). They are **usually regex-replace rules, rarely
   code — never agentic** (owner decision). The discipline this imposes on
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

6. **Each pack has a version number**, and **each pack version declares the
   minimum engine version it requires**, enforced by the updater: a pack
   update never applies past the installed engine (§5). This is what makes
   the split coherent — the current single-snapshot guarantee ("the set and
   the content can never come from different snapshots") is replaced by a
   *checkable* compatibility constraint rather than dropped.
7. **A pack update is deterministic first**: vendor the new pack version,
   run its version-ranged migrations (vN→vN+1, in order), converge wiring.
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
9. **The pack update merges its PR to main** unless it ends non-green.
   **Every** non-green terminal — unanswered interview questions, an agentic
   repair that leaves checks red, a migration that could not complete —
   ends the same way: the PR stays open, the dispatch issue is tagged
   `need-human`, the run stops. Interviews are one instance of the rule,
   not the rule.

## 4. Install = update from version zero

Installing a pack is the pack updater started with no prior state: vendor,
run migrations from version 0, converge, agentic apply, deliver — the same
flow, same terminals (§3.9: interview unanswered → PR open + `need-human`).
Two install-specific provisions:

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
  held-stamp subtleties (#329, #330).
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

## 6. What this retires

- The `baselining` task (task.md, task.mjs, worker.mjs), its escalation
  codes, and its dispatch-issue protocol.
- The `agentic:` field on migration records: engine migrations may not
  carry it at all; pack migrations express agentic work as the pack
  update's apply stage instead.
- The date-held stamp (`claudinite.updated` gating note application).
- The baselining vocabulary, corpus-wide.

## 7. Known-open

- The `local-pack-namespace` declaration rewrite (bare id → `local/<id>`)
  remains unowned; the versioned scheme should place it in an engine
  migration (it is a regex on the declaration file — squarely within §2.3).
- Escalation-frequency measurement across the fleet (which `escalation()`
  codes actually fire) would validate the split's cost model; nice to have
  before Phase 2, not a blocker.

## 8. Migration

Phased rollout tracked in the migration-plan issue (filed alongside this
doc). Summary: version scaffolding first (no behavior change), then the
engine flow, then the pack flow, then install, then retirement of
baselining and its vocabulary.

## 9. Owner decisions recorded

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
