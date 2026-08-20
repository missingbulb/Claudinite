# The task label scheme — `task:status:*` / `task:origin:*`

Every label the queue machinery writes lives in the `task:` namespace and is one
of three things: the item's single status, its origin, or the urgency flag.
The label vocabulary is the compatibility surface across engine versions
([work-item.mjs](../../engine/scheduler/queue/work-item.mjs) holds it, and
nothing else does).

## Status — exactly one, always

`task:status:` + one of: `blocked`, `waiting-for-executor`, `running-executor`,
`running-agent`, `needs-human-action`, `needs-human-decision`,
`needs-human-approval`, `needs-human-failure` (open states), `done`, `rejected`
(terminal, on the closed issue).

Statuses are mutually exclusive: a live work item wears exactly one. An open
item wearing none is torn — a label swap interrupted mid-flight — and is the
janitor's repair case. A human park whose kind cannot be decoded (an unknown
future kind, a bare legacy `needs-human`) reads as `needs-human-failure`: the
conservative lane, so an unclassifiable park blocks rather than silently joining
an inbox nobody treats as urgent.

The four `needs-human-*` kinds are disjoint by **remedy**: `action` — something
outside the code must change (a secret, a grant, a fixed endpoint); `decision` —
the run stopped mid-flight and what happens next is a choice; `approval` — the
run succeeded and left an unmerged PR, the one park that is not a fault;
`failure` — the run broke and someone must diagnose. Only `failure` holds the
task's lane (no further occurrence is filed while it stands): filing a queue of
runs that will break the same way helps nobody, while a PR awaiting approval, a
pending choice or a missing secret must not also stop tomorrow's run.

*Alternative — a base `needs-human` label plus a kind sub-label (two labels per
park).* It lets the machine test one literal label, but every park must wear
both, a half-applied pair is a new torn state, and "which kinds block" is
decided by the absence of labels rather than the presence of one. A single
status plus a `task:status:needs-human-` prefix test gives the machine the same
one predicate without the pairing invariant.

*Naming note:* `rejected` covers every run that never happened — the
precondition declined, or the task is gone from HEAD — not only a human's no.

## Origin — where an item came from, for life

`task:origin:planned` | `task:origin:ad-hoc` | `task:origin:github` — mutually
exclusive, applied when the item is born, never removed (the closed issue keeps
it). `planned`: the generator filed it at a task's anchor. `ad-hoc`: a person
asked for it (the request mark, below). `github`: GitHub-side infrastructure
filed it (a workflow-failure report).

The origin label is the **single authority** on this fact: the generator's
occurrence guard, the dedupe and the `after` yield all read it. Items that
predate the scheme carry no origin, and only for those does the reader fall back
to deriving the answer structurally (title qualifier + declared frequency).

*Alternative — structural derivation as the authority, labels display-only.* A
marker beside a derivation is two authorities over one fact, and they can
disagree; a display-only label would be exactly that. Making the label the one
authority removes the duplication in the other direction — and unlike the
derivation, it survives a task's declaration changing under an open item
(a frequency edit, a pack rename) without re-interpreting history.

## Urgency

`task:urgent` — pick before any non-urgent item. The only label that is neither
status nor origin.

## A request is a work item

An ordinary issue becomes a run of a task by wearing `task:origin:ad-hoc`; the
issue **is** the work item, and the whole lifecycle plays out on it:

- **The mark.** A person applies `task:origin:ad-hoc`. A label, not a body
  syntax: appliable from the issue page on a phone, and write-gated by the
  platform (labeling needs triage access).
- **Adoption.** The next scheduler run sees `task:origin:ad-hoc` with **no
  status** — that combination is the exactly-once guard — appends the machine
  block to the body (task path, model, merge authorization, the carried
  `Blocked-by:` / `Not-before:`), and sets the first status.
- **Parameters** live in the body (`Model:`, `Automerge:`, `Blocked-by:`,
  `Not-before:`, `Task:`) and are honored only when the issue **author** holds
  push access, read from the collaborators-permission API — never
  `author_association`, whose broadest values include read-only collaborators.
  A non-collaborator's ask still runs: default model, never automerged.
- **Target task.** `Task: <pack>/<task>` aims the request at any declared task;
  absent, it runs the built-in implement-request task. This makes "an issue that
  asks a task to run, with parameters" the one primitive behind every
  eligibility-mark protocol (pack-adoption work lists, per-repo request kinds),
  instead of each task inventing a label and a bespoke precondition.
- **Re-ask.** After a park or a rejection, removing the status label restores
  the bare mark — still phone-sized — and the next scheduler run adopts afresh.
  While a prior run is live the mark waits; a parked one is superseded.

*Alternative — a shadow work-item issue per request (the marked issue holds the
conversation, a separate `[claudinite-work]` issue holds the state).* Two issues
then tell one story: every state change must be mirrored into request-facing
labels or the asker can't see it, and the pair can disagree. The costs of the
one-issue shape are the mirror image: machine fields share a body the human
authors (hence the delimited machine block and the author gate), and the state
machine's label churn lands on the asker's issue.

*Alternative — parameters as labels.* Write-gated for free, but each value is a
label (`model:opus`, `model:sonnet`, …), the set grows with every parameter, and
values that aren't enumerable (a blocker list, a date) can't be labels at all.
The body carries arbitrary values; the author gate restores what the platform
gate provided.

*Alternative — trusting the body unconditionally.* Simplest, and unsafe on any
public repo: a body is author-editable after marking, so a drive-by author could
escalate the model or self-authorize a merge.

Standing (planned) items keep their own issues and the `[claudinite-work]`
title. A work item is recognized by *either* signal — the title prefix or a
`task:origin:*` label — so recognition survives whichever half a given item
lacks.

## Infrastructure failures are parks

The scheduler/executor workflows report their own failures as issues wearing
`task:origin:github` + `task:status:needs-human-failure`: a broken workflow run
is a park like any other, and origin already says who filed it, so no dedicated
label exists. The drawback accepted: such issues are not parseable work items
(no task path), so anything that reads parked items must tolerate a park that
is not an item.

## What stays outside the namespace

Labels that are one task's **domain artifacts** — convergence keys by which a
task re-finds its own output issues across runs (the fleet sweep's per-repo
adoption and drift issues) — are not queue state and stay out of `task:*`.
Mapping them in would have two mechanisms writing the same labels under
different convergence rules, which is the ambiguity a single namespace exists to
end. Eligibility-mark labels, by contrast, are requests in disguise and migrate
to task-targeted requests as their owners convert.

Likewise gone: any label whose job was to find a task's own unmerged PR. A run
that leaves a PR open parks its item at `task:status:needs-human-approval`, so
"the previous round is still in review" is readable from the queue itself and a
precondition gates on that, not on a labeled PR.

## Compatibility — read everything ever written

Labels are stored data: closed issues keep theirs forever, and fielded engines
keep writing their own spellings until they converge. So the engine writes only
the vocabulary above but **decodes every spelling ever written**, each mapped
straight to its canonical status in one pass: the flat `task:*` states, the
`needs-human` pair, `task:done` / `task:obsolete`, the three `outcome:*`
spellings, the five `claude-*` request labels, `workflow-failure`, and
`origin:schedule`. The map never shrinks, and old label *definitions* are never
deleted from a repo — deleting a label strips it from closed issues too.

Two consequences bind the fielded surface: the executor workflow's event
trigger names label strings literally, so it accepts the legacy ready/urgent
spellings for as long as any fielded engine writes them; and the legacy
constants stay exported for the pack workers that import them.
