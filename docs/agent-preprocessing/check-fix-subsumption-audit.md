# Check-fix subsumption audit

Absorbed from #405, tracked in [DESIGN.md §11](DESIGN.md). **Load-bearing
question:** is it safe to make baselining's common (mechanical) night fully
**agentless** — drive its `agent_model` toward `null` — relying on the escalation
gate to summon an agent only when judgment is genuinely left?

The old baselining ran an AGENT "align" step that, for every failing conformance
check, applied that check's own `fix` remedy. E4 replaced the mechanical work with
a deterministic preprocessing worker and made the agent stage **conditional**
(agent-preprocessing DESIGN §3, §11). For that to be safe, every check the old
align step would have fixed must be **either** (a) handled deterministically by
preprocessing, **or** (b) caught by the escalation gate so it still summons the
agent. A check that is *neither* would be a **silent regression** — drift the old
model repaired that the new model neither fixes nor escalates on.

## The two things the new model relies on

1. **The four deterministic repairs** preprocessing runs
   ([`worker.mjs`](../../packs/basics/tasks/baselining/worker.mjs)):
   - **converge** — rebuild `.claudinite/shared/` to the canon vendor set
     ([`apply-vendor-set.mjs`](../../vendoring/apply-vendor-set.mjs)).
   - **converge-wiring** — the scheduler workflow + hashed cron, the settings
     hooks, and the retired-import removal
     ([`converge-wiring.mjs`](../../engine/scheduler/converge-wiring.mjs)).
   - **declaration-normalization** — the `local/<name>` pack token.
   - **mechanical migrations** — aliases / materialize / rewrite
     ([`migrations/apply.mjs`](../../migrations/apply.mjs)).
2. **The escalation gate** — preprocessing requests the agent iff a pending
   *agentic* migration note exists, **or** the converge changed something and
   `check_the_world` is **not green**.

## Finding — the classification of all 59 checks

Full per-check classification was produced by enumerating every rule module
(`packs/*`, `packs/*/skills/*`, `engine/checks/`, `.claudinite/local/packs/*`).
The shape of the result:

- **Subsumed by a deterministic repair — 2.**
  - `scheduler-workflow-shape` → **converge-wiring** rewrites that exact workflow
    to the vendored stub with the repo's hashed cron.
  - `cer/release-workflows` → the `chrome-release-vendoring` migration's
    materialize/rewrite self-heals the vendored reusable-workflows/actions drift.
    (Its orchestrator name/schedule/token assertions are one-time adoption
    authoring, not recurring nightly drift.)
- **No check maps to converge, declaration-normalization, retired-import, or
  hook-registration.** Conformance rules target the consumer's **authored**
  surface, never the vendored mount content or the wiring registrations. So those
  repairs run **unconditionally** in preprocessing with no gate needed — there is
  nothing for a check to have caught.
- **Needs-judgment — the rest (~55).** Genuine decisions: code quality, author
  doc/reference integrity, file placement, security, process discipline, pack /
  release / product-wiki authoring. These are exactly what *should* summon an
  agent, not be auto-edited by a mechanical converge.

## The load-bearing subtlety — `check_the_world` ≠ every check

The escalation gate runs **`check_the_world`** (world scope). It does **not** run
**8 work-scoped rules**, which run only in `check_the_work` against a session's
diff/transcript:

`reference-integrity`, `comment-classification`, `task-lifecycle`,
`squash-merge-history`, `feature-requirements-first`, `node/earn-each-dependency`,
`cer/permission-added-store-issue`, `google-client-id-single-origin`
(plus `promote-scope`, a CI-only gate on the growth-promote branch).

So the gate is **blind** to those 8. Are they a silent regression? **No** — and
this is the crux of why the agentless night is sound:

> A work-scoped check judges a **session's change**, not standing repo state. On an
> agentless night there is no agent session, and preprocessing's only change is the
> **mechanical converge** — vendored canon files (already clean) plus the stamp.
> That diff makes none of the moves these checks police:
> - `reference-integrity` / `markdown` — the converge writes vendored files, which
>   carry no broken author links; pre-existing dangling links in *unchanged* author
>   files were never in a work-scoped check's view (or the old align's), so leaving
>   them is not new.
> - `task-lifecycle` / `squash-merge-history` — baselining's delivery is one
>   mechanical commit that `Refs` the tracking issue on the maintenance PR, correct
>   by construction.
> - `earn-each-dependency` / `permission-added` / `google-client-id` /
>   `comment-classification` / `feature-requirements-first` — each fires on a
>   specific authored act (adding a dep, a permission, a client-id literal, replying
>   to the owner, a feature commit) that a mechanical converge never performs.

Every check that judges **standing repo state** (the drift a nightly refresh is
meant to catch) **is** world-scoped and therefore **is** in the gate. The
work-scoped exclusions judge changes the converge does not make. **No silent
regression.**

## Conclusion

**It is safe to drive baselining's common-night model toward `null`.** The
escalation gate (`check_the_world` green **and** no pending agentic note) covers
every standing-repo judgment check; the deterministic repairs cover the mount,
wiring, normalization, and mechanical migrations (none of which a check guards);
and the work-scoped checks the gate omits judge session changes a mechanical
converge never makes. Until the model is actually flipped to `null`, the gate is
already the operative safety net — a converge left non-green escalates today.

## Backlog — mechanize to reduce needless escalation (non-blocking)

Three **world-scoped** needs-judgment checks have a genuinely **rote** fix. Today a
repo failing one escalates to an agent (safe, but wasteful). Making each an
additional deterministic repair would keep more nights agentless:

- `catalog-completeness` — regenerate `packs/README.md` entries from the pack tree.
- `generated-merge-driver` — add the known `.gitattributes` `merge=ours` line for a
  GENERATED file that lacks it.
- `cer/version-sync` — set `package.json` version := the manifest version.

None blocks the null-model flip; each is an incremental way to shrink the set of
nights that need an agent at all.
