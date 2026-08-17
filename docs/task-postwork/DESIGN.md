# Task postwork — design

A capability for the per-project scheduler
([`../per-project-scheduling/DESIGN.md`](../per-project-scheduling/DESIGN.md)), the mirror of
[`../task-prework/DESIGN.md`](../task-prework/DESIGN.md); this record extends both and does not
restate them.

**This is a design-only record — the mechanism, not its rollout.** Implementation status, phase
tracking and remaining work live in the tracking issue, **#940**, not here.

The shape: a task may declare a **postwork** stage — a command run Action-side, with the Action
`GITHUB_TOKEN` and the task's `required_secrets`, **after** its agent finishes and **before** the
work item closes. The agent ends at its last judgment, records its verdicts, and code does the
bookkeeping.

---

## 1. Why

The split a task should make is **judgment vs. the bookkeeping that records it**. Today one agent
does both, and the bookkeeping is where an agentic run is least reliable: it comes last, so it is
what a run out of budget drops, and a tracker rewritten halfway is worse than one not rewritten at
all.

Two tails are genuinely post-agent and deterministic:

1. **Landing a PR.** [`../../engine/scheduler/land-pr.mjs`](../../engine/scheduler/land-pr.mjs) is
   the code lane; [`../../engine/scheduler/deliver-pr.md`](../../engine/scheduler/deliver-pr.md) is
   a hand-maintained prose twin of it for the agent lane, and says so at its own head — *"the two
   must keep saying the same thing."* The twin exists for one reason: an agent cannot run the
   module, and no code phase survives it. Every `merged-pr` agentic task re-performs the
   delivery-preference read, the squash arm, the clean-status rejection, the parked
   `action_required` run and the verify-then-merge fallback in prose.

2. **Writing a run's verdicts to the standing tracker** — the body rewritten to today's snapshot
   plus a dated comment, in `tidy-issues`, `tidy-prs`, `tidy-branches`, `rule-revalidation`,
   `prose-to-checks-sweep`, `ci-performance` and `wiki-growth`. `tidy-issues` names it in its own
   model note: *"the reconcile is mechanical aggregation."*

A third candidate — post-hoc verification that the run stayed inside its ceiling and its commit
referenced the tracking issue — is real but weak: those are CI checks on the PR today, and moving
them buys speed rather than correctness.

That is the whole case. Two earlier candidates were withdrawn on review (owner, 2026-08-17):

- **The tracker's setup half is prework, not postwork** — §2.
- **`growth-extract`'s retention pruning is a task of its own**, not a phase of this one —
  see #964.

## 2. Move it earlier before you move it later

The first question about any mechanical tail is not *"can code do it after?"* but **"does it depend
on the agent's judgment at all?"** Most of what looks like a tail is setup that merely got written
last, and prework already exists to carry it.

Every one of the seven tracker-writing tasks makes its agent do this, in near-identical prose:

> find the issue titled exactly `Claudinite tracker: <X>` — by that **exact title, never a fuzzy
> match, never a hard-coded number**; create it **already closed** if absent; never open, close or
> reopen it.

None of that needs the agent. It is a search, a create-if-absent and a read, and prework holds the
token to do all three. Moving it:

- deletes the paragraph from seven task docs, and with it the fuzzy-match failure mode — an agent
  that matches the wrong issue rewrites the wrong body, silently;
- normalizes the titles, which have already drifted (`ci-performance`'s tracker is
  `[claudinite] CI performance`, not `Claudinite tracker: CI Performance`);
- hands the agent a **number**, in the item's `Context` — where every task's binding scope already
  arrives (`tidy-issues` passes `Issues to triage: #…`, `tidy-prs` passes its read-only PR list).
  Prework, not the precondition, does the read: the scheduler's `issues` signal deliberately hides
  the standing trackers, so they are invisible to a precondition by design.

For `rule-revalidation` the gain is larger than tidiness. Its **slice** — which claims to probe —
is derived from the tracker log's history of prior verdicts. That is a fold over comments, computed
before any judgment happens, and it is currently the agent's first act.

**The rule this generalizes to, and the one worth carrying beyond this record:** work moves to
prework unless it *consumes the agent's output*. Postwork is the exception, not the symmetric
half.

> **A tracker is not a task-machinery feature** (owner, 2026-08-17). The first attempt at this
> made it one — a `tracker` title in the contract, resolved by the scheduler for every task that
> declared it — and that is the wrong shape: some tasks keep an aggregated record and most never
> will, so the machinery has no business knowing. What a task does instead is **its own**: resolve
> the issue in its own prework and pass the number on through the hand-off payload
> (`delivered.issue`), which the executor renders into the work item as an `Issue:` line. The lookup
> and the create-then-close pair are a library prework may call — never a phase, and never a
> mandate. Creation stays a separate call because whether a run with nothing to say should mint a
> tracker is a judgment the task owns. That remodelling is its own change, reviewed separately
> (#941); this record only carries what it settled.
>
> So §2's general rule stands, but its lever is the task's own prework, not the contract.

## 3. What is left after that

Only what cannot exist before the agent's judgment does:

| tail | why it can't be prework |
| --- | --- |
| land the PR | the branch is the agent's output |
| write the verdict comment / body snapshot | the verdicts are the agent's output |
| verify the run's own outcome | there is no run to verify yet |

One alternative to postwork survives for the second row, and is worth naming because it needs no
new phase at all: **the agent posts its verdicts as one dated comment, and the body snapshot is a
fold over those comments done by an agentless task** — `usage-fold`'s shape exactly. The cost is a
cycle of lag on the body and a second task per dimension; the gain is that nothing new is invented.
Postwork wins here only if same-run freshness matters, which for a daily tracker it may not.
**Undecided — this record does not settle it.**

## 4. The load-bearing condition: the agent's ceiling

Postwork is only worth a contract field **if the agent stops making the writes postwork exists to
make**. If the agent may still merge, there are two lanes able to land a PR, the prose twin
survives to describe one of them, and the design has added a phase without removing anything.

So a task that declares `postwork` narrows what its agent may do, and the narrowing is the
deliverable:

- **may** — read anything, push a branch, open a PR, write its `### Verdicts` section (§6);
- **may not** — merge or arm a PR, rewrite a tracker body, close or reopen any issue, delete a ref.

This is enforceable the way the outcome ceiling already is: the executor knows the task declares
postwork, so the agent's brief carries the narrower ceiling and the postwork command is the only
thing holding the token that does the rest.

## 5. What the Action token actually can't do

The relevant limit is **not** merging. `land-pr.mjs` merges with the Action `GITHUB_TOKEN` today
(`PUT /repos/{repo}/pulls/{n}/merge`, squash), and that is the live landing path for `core/update`,
`usage-fold` and `fleet-usage`. Where a repo's branch protection refuses the token's merge, the
module already degrades to leaving the PR open with the reason stated — a delivered outcome, not a
failure.

The real refusal is **`.github/workflows/`**: GitHub rejects a `GITHUB_TOKEN` push touching that
path, and rejects the *whole ref* with it, so one workflow file fails an entire converge. That is
what the withhold lane (`.claudinite/pending-workflows/`) and the agent hand-off exist for — #649,
[`../../packs/canary-probe/README.md`](../../packs/canary-probe/README.md).

Two consequences for this design, and they point opposite ways:

- **Postwork may never carry a workflow-file write.** A task whose delivery includes one keeps that
  write in its agentic phase, where the MCP credential is. This is the one case where §4's ceiling
  cannot be applied whole.
- **Everything else about delivery is fine in postwork**, including the merge — plus one property
  the agent lane lacks: `land-pr.mjs` already compensates for the token's recursion suppression by
  dispatching the PR's checks itself, so the "my push started no run" hazard is handled in code
  rather than described in prose.

## 6. The structural problem, and the staging

Prework is a subprocess of the executor's own run, so it is simply *called*
([`../../engine/scheduler/prework.mjs`](../../engine/scheduler/prework.mjs)). Postwork cannot be:
`handOff` in [`../../engine/scheduler/queue/executor.mjs`](../../engine/scheduler/queue/executor.mjs)
is the executor's **last act** — it swaps the item to `task:agent`, starts the session and returns,
and the Action job ends. The agent converges the item later with no Action-side process alive.

So postwork is **a second executor visit to the same item**, not a second phase of one visit. Three
existing properties make that cheap: the executor already fires on a **label event**
([`../../.github/workflows/claudinite-executor.yml`](../../.github/workflows/claudinite-executor.yml)),
so the agent's own label swap starts the job with no added latency; that job is already the only
place secrets live; and a stuck state is covered by the executing leash and the janitor's sweep.

```
… executor hands off  →  task:agent  →  the agent session does its judgment
                                          │
                                          ├─ no postwork declared → the agent converges the item
                                          │  itself (today's behaviour, unchanged)
                                          │
                                          └─ postwork declared → the agent writes its verdicts into
                                             the item (§7) and swaps task:agent → task:postwork
                                                    │
                                                    ▼
                              a labeled event starts the executor, which claims the item and runs
                              the declared command as a subprocess (cwd = the task dir, Action
                              GITHUB_TOKEN + required_secrets + CLAUDINITE_* in env), bounded by
                              postwork_timeout — a hard SIGKILL, as prework's is
                                    │
                                    ├─ success → close: outcome:delivered / outcome:done
                                    └─ failure or timeout → needs-human, verdicts preserved (§8)
```

`task:postwork` joins `QUEUE_LABELS` and the executor's pick order as a state the executor may
claim; the same-title mutex and the claim lease apply to it unchanged.

## 7. Contract additions

Two fields, both optional, so every existing task stays valid:

```js
export default {
  // …existing: id, frequency, precondition_signals, agent_model,
  //   expected_outcome, agent_instructions, prework, prework_timeout…

  postwork: 'node finish.mjs',   // OPTIONAL. A command run after the agentic phase. Its executable
                                 //   MUST be a script beside task.mjs — the same containment
                                 //   `prework` and `agent_instructions` already carry.
  postwork_timeout: 300,         // seconds. Hard kill; exceeding it fails the run. Required
                                 //   whenever `postwork` is set, and bounded under the executing
                                 //   leash for the reason prework's is (contract F17).
};
```

Rules `task-contract.mjs` enforces:

- `postwork` is a non-empty string whose first token resolves to a file in the task directory — no
  absolute paths, no `..`;
- `postwork_timeout` is a positive integer, **required** when `postwork` is set, and under the
  executing leash;
- `postwork` on an **agentless** task (`agent_model: 'none'`) is an error, not a synonym for more
  prework: there is no agent whose output it would consume, and the phase's definition is "after
  the agent". Such a task extends its prework instead.

The binding invariant: **postwork runs iff the agentic phase ran.** A task whose prework declines
the hand-off (`CLAUDINITE_REQUEST_AGENT` unwritten) closes exactly as it does today — an agentless
night has no verdicts to post-process.

### The channel

Prework communicates only through the repository, and there is deliberately no code→agent data
channel. Postwork needs the reverse direction, and inventing it is the cost of this design.

**The channel is a section of the work item**: a `### Verdicts` section carrying one fenced JSON
document, written by the agent with the existing `withSection` helper in
[`../../engine/scheduler/queue/work-item.mjs`](../../engine/scheduler/queue/work-item.mjs) — which
replaces rather than appends, so a re-queued item cannot end up with two of them (#879).

Over the alternatives — a committed file (needs a PR, or a write to `main` behind the change the
task is delivering), a scratch path (does not survive the job boundary), an artifact upload (a
second platform surface for one string) — the item is **already** the state carrier both sides read
and write, it already survives exactly the boundary being crossed, and an operator can read the
hand-off in the timeline.

**It is data, and the existing rule applies unchanged**: the *task path* is code-validated, the
*item* never is. The postwork command schema-validates the section before acting on it, and a
malformed or absent one parks to `needs-human` rather than defaulting. `agent_model` and
`expected_outcome` keep coming from the repo, never from the item.

## 8. Failure, retry and idempotence

- **Postwork failed** → the item converges to `needs-human` with the detail, as a failed prework
  does. The verdicts stay in the body, so re-queueing is a label change and no judgment is re-run —
  which is the point: the expensive half already happened.
- **Postwork ran twice** — a reclaimed lease, an operator re-queue, a runner killed after its
  writes landed. It **must** be idempotent, and the corpus rule for a helper reapplied across a
  hand-off applies: call it twice and assert no duplication. `land-pr.mjs` and
  `deliver-generated.mjs` are already written this way — the base branch is the only authority and
  an identical recompute opens nothing.
- **The agent died before writing verdicts** → the item sits at `task:agent` with no section, and
  the janitor's agent leash sweeps it to triage. Nothing new is needed.

## 9. What stays with the agent

Judgment, and the workflow-file write of §5. The test for everything else is whether a second
reasonable agent would produce a different result — if yes it is judgment, if no it is bookkeeping.
Judgment includes `single-issue-triage`'s close-vs-comment call and every "confirm it against
`main`'s content now" the tidy policy rests on; `ci-performance`'s A/B, where "revert what does not
show" is a reading of two measurements; and `growth-extract`'s is-this-lesson-new, which is why
that task is `agent_model: opus`.

## 10. Owner decisions

- **2026-08-17** — the survey of task tails is accepted and this record is the agreed next step;
  scope is the design only. No contract field, no executor change and no task conversion lands
  until this record is reviewed.
- **2026-08-17** — on review: the tracker's find/create/read half moves to **prework**, not
  postwork (§2); `growth-extract`'s retention prune becomes its **own agentless task** (#964) and
  leaves this record; and postwork is worth building only under §4's narrowed agent ceiling.
