# Fleet: get every member declaring the packs it is missing

**This task runs no agent.** It is `agent_model: none` with a parameterised `code_work` ([`worker.mjs`](worker.mjs)), so the whole pass is deterministic code the executor runs as code-work. This file is the human-facing record of what that code does; there is no agent phase on the enforcer side. The *agentic* half of the job belongs to each member's own **adopt-requested-packs** task (claudinite-growth) — see "The fan-out model" below.

## Two first stages, one parameter set

The task is parameterised over the two ways a pack comes to be missing ([`params.mjs`](params.mjs) — no parameter has a default; both call sites say everything):

| run | parameters | first stage |
|---|---|---|
| weekly (scheduled) | `--scan-for-needed-packs=true --repos=all-covered-members`, on the `code_work` line in [`task.mjs`](task.mjs) | the **scan** ([`scan-for-needed-packs.mjs`](scan-for-needed-packs.mjs)): fingerprint every covered member's tree against the canon corpus and *suspect* what its declaration does not carry |
| forced (hand-created item) | the item's Context, one `--context` line each: `SCAN_FOR_NEEDED_PACKS=false`, `REPOS=Alpha Beta`, `ADD_PACKS=<ids>`, `PACK_CONFIG=<pack>.<key>=<v>`, `PACK_ANSWER=<pack>.<question>=<answer>` (values space-separated — the bag splits on commas) | the **force** ([`force-add-packs.mjs`](force-add-packs.mjs)): the owner names the packs, repos, config and interview answers — nothing is suspected, because it was decided |

A force **refuses itself entirely** — before any issue is written — on an unknown pack id, a repo that is not a covered member or is dormant, `all-covered-members` as a target, or **any adoption-interview question the overrides did not answer**: an answer is the owner's to give, never one this task may infer.

## The fan-out model

Both stages end the same way, per member with work ([`protocol.mjs`](protocol.mjs)):

1. **Converge one work-list issue in that member** under the `add-packs` label — `Add packs: requested for this repo` (a decision, carrying the exact declaration entries as JSON, config and answers included) or `Add packs: suspected from this repo’s shape` (a suspicion, carrying the evidence and the fingerprints the REST sweep could not decide).
2. **Mark it** `task:origin:ad-hoc`, with `Task: claudinite-lifecycle/adopt-requested-packs` in the body. The issue then *is* that member's work item: its own scheduler run adopts it, its own executor picks it up (tasks-dispatch DESIGN §16.12). A second work list in the same member names the first in `Blocked-by:`, so the two run one after the other rather than putting two sessions on one declaration.
3. **Nudge it** by dispatching that member's scheduler — an ordinary run, no `wake`. This is latency only: a member that refuses the dispatch adopts the mark on its own next hour.

The member's agent reads the issue it is running on, its own executor confirms/adopts with the repo checked out, and one reviewed PR lands *there*. Nothing here writes to any member's tree, and no agent anywhere needs cross-repo access — the one fleet credential is `FLEET_GITHUB_TOKEN`, granted as [`fleet-token.mjs`](../../fleet-token.mjs) states it.

## Convergence

- A **requested** issue closes `completed` once the member's declaration carries everything its JSON block asks for — checked on every weekly visit, whichever run opened it.
- A **suspected** issue closes `completed` once the member declares the packs (or its shape stops suggesting them), and a `not planned` close is a standing decline the scan honours rather than re-suggesting weekly.
- A member with a still-open work list is **nudged again** on the weekly visit, and a work list whose ask has actually changed has its status cleared — the sanctioned re-ask, and the retry loop for a member whose earlier adoption run parked.

## Failure is loud

A member that could not be swept is `unknown` — never "fitted" — and that fails the run; the executor converges the item to `needs-human`. A member whose scheduler refused the nudge dispatch is only reported: since the work list is a marked issue, the dispatch decides when it is adopted, never whether.
