# The task label scheme — `task:status:*` / `task:origin:*`

The one namespace for every label the queue machinery writes, replacing the mixed
vocabulary (`task:ready`, `needs-human` + sub-labels, `outcome:*`, `claude-*`,
`workflow-failure`, `product-wiki-growth`). The label-and-field vocabulary is the
compatibility surface across engine versions
([work-item.mjs](../../engine/scheduler/queue/work-item.mjs)); this document is the
mechanism of the new surface. Status and remaining work live in the tracking issue
(#1119); the phased plan is the sibling [MIGRATION.md](MIGRATION.md).

## Status — exactly one, always

`task:status:` + one of:

| status | replaces | open/terminal |
|---|---|---|
| `blocked` | `task:blocked` | open |
| `waiting-for-executor` | `task:ready` | open |
| `running-executor` | `task:executing` | open |
| `running-agent` | `task:agent` | open |
| `needs-human-action` | `needs-human` + `task:needs-human-action` | open |
| `needs-human-decision` | `needs-human` + `task:needs-human-decision` | open |
| `needs-human-approval` | `needs-human` + `task:needs-human-approval` | open |
| `needs-human-failure` | `needs-human` + any other sub-state | open |
| `done` | `task:done` (and read: `outcome:done`, `outcome:delivered`) | terminal |
| `rejected` | `task:obsolete` (and read: `outcome:obsolete`) | terminal |

Statuses are mutually exclusive by definition. A live work item wearing none is
torn (the janitor's repair case, unchanged); a park whose classification is
unknown — an older writer, a future kind this engine doesn't know — decodes as
`needs-human-failure`, the conservative lane (#1051). Lane-holding keeps today's
semantics, decided by which single status: `needs-human-failure` holds the task's
lane; `action`, `decision` and `approval` are a person's inbox and do not.

The two-label park (`needs-human` + sub-label) collapses into one: the machine
predicate that read `needs-human` becomes a prefix test on
`task:status:needs-human-`.

## Extra data — the only non-status labels

- `task:urgent` — pick before any non-urgent item. Unchanged.
- `task:origin:planned` | `task:origin:ad-hoc` | `task:origin:github` — mutually
  exclusive, applied when the item is born, kept for its whole life (and on the
  closed issue).

The origin label is the **single authority** on where an item came from. This
deliberately reverses the `origin:schedule` deprecation: that marker was rejected
as a second authority beside structural derivation, so here the derivation side
stands down — `isStandingItem`-style structure survives only as the decode
fallback for items filed before the scheme. The generator writes `planned` at an
anchor; adoption writes `ad-hoc` for a person's ask (or the person applies it —
see below); GitHub-side infrastructure (workflow-failure filings) writes `github`.

## One issue per request

The marked issue **is** the work item — request mode stops filing a shadow
`[claudinite-work]` issue. The `claude-*` request vocabulary retires into it:

| was | becomes |
|---|---|
| `claude-task` (the mark) | `task:origin:ad-hoc`, no status |
| `claude-queued` | `task:origin:ad-hoc` + `task:status:waiting-for-executor` (or `blocked`) |
| `claude-in-review` | `task:origin:ad-hoc` + `task:status:needs-human-approval` |
| `claude-automerge`, `claude-model:*` | body parameters (below) |

- **The mark** stays a label for the same reason as today: appliable from a phone,
  and write-gated by the platform (labeling needs triage access).
- **Adoption** (the scheduler's job 4): sees `task:origin:ad-hoc` with no status,
  appends the machine block to the issue body (task path, model, merge, the
  carried `Blocked-by:`/`Not-before:`), and sets the first status. "Origin with no
  status" is the exactly-once guard, replacing label consumption: statuses are
  written by the machinery, and the origin label never comes off.
- **Re-ask** after a park or rejection: the person removes the status label,
  leaving the bare mark again — still phone-sized. Supersede semantics (F28)
  carry over: a live status waits, a parked one is replaced.
- **Parameters** (`Model:`, `Automerge:`, plus the existing `Blocked-by:` /
  `Not-before:`) move into the issue body, and are honored only when the issue
  **author** has push access — read from the collaborators-permission API at
  pickup, beside the marker-permission read that exists there today, never from
  `author_association` (#1067). A non-collaborator author's ask still runs, at
  the default model, never automerged. This keeps the write-gate the labels had:
  a body is author-editable where a label is not.
- **Task-targeted requests**: the machine block's task path generalizes the mode —
  a mark may name a target task (`Task: <pack>/<task>`, author-gated like the
  other parameters), defaulting to `basics/implement-request`. `add-packs` folds
  into this: the enforcer files its work-list as a request targeting the member's
  adopt task, and the bespoke label + bespoke precondition retire. GCEC's
  `extractor-request` can follow the same path on its own schedule.

Planned (standing) items keep their own issues and the `[claudinite-work]` title.
"Is this a work item" reads *either* signal — the title prefix or a
`task:origin:*` label — so a reader survives whichever half an old item lacks.

## Folded-in vocabularies

- **`workflow-failure`** — the scheduler/executor stubs file their failure issues
  as `task:origin:github` + `task:status:needs-human-failure`. Only GitHub
  Actions ever wrote it; the origin label now carries that fact explicitly.
- **`product-wiki-growth`** — retires. The gate it carried ("no second research
  round while the last round's PR sits unreviewed") re-derives from queue state:
  since the approval park, a run that leaves an unmerged PR parks its item open at
  `task:status:needs-human-approval`, so the wiki-growth precondition declines
  while an open item of its own task wears that status, instead of hunting a
  labeled PR.
- **`fleet-adoption` / `fleet-drift`** — out of scope pending an owner decision
  (see #1119). They are not queue state: the daily fleet-roster task's private
  convergence keys for its human-inbox issues in the enforcer repo.

## Compatibility

- **Write new, read everything ever written.** Every old spelling maps straight
  to its canonical status in one pass (the stored-data rename rule, #1013):
  the `task:*` states, `needs-human` + sub-labels, `task:done`/`task:obsolete`,
  the three `outcome:*` spellings, the five `claude-*` request labels,
  `workflow-failure`, and `origin:schedule`. Closed issues keep their labels
  forever, so the decode map never shrinks — and old label *definitions* are
  never deleted from a repo, because deleting a label strips it from closed
  issues too.
- **The executor stub's event trigger** names label strings
  (`task:ready`/`task:urgent`). The stub must accept old and new spellings before
  any engine writes the new ones; the ordering is MIGRATION.md's whole subject.
- **Exports hold.** `work-item.mjs`'s constants stay exported (fielded pack
  workers import them); their values flip only in the write-side phase, after the
  read side and the stubs are fielded.
