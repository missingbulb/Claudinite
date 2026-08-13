# Task dispatch — what the literature says

Owner request on #784, track 2: survey how real execution engines handle the
problems [DESIGN.md](DESIGN.md) takes on — scheduler unreliability, executor
scaling and death, claiming without compare-and-swap, baton-passing,
callbacks, once-ness — *"to get better acquainted with the existing
literature, not to implement the most complex mechanism."* Four web sweeps
(job queues; schedulers; workflow orchestrators; distributed leases +
GitHub-issues-as-queue prior art), synthesized here against our decisions.
Sources inline; the scale caveat governs throughout: we run tens of items a
day under human review, not millions under SLOs — we import *lessons*, and
name what we deliberately leave on the shelf (§4).

## 1. The one sentence per literature

- **Job queues** (SQS, Sidekiq, BullMQ, Celery, Postgres `SKIP LOCKED`):
  every one of them claims work with a *lease that expires* rather than a
  flag, admits **at-least-once** execution, bounds retries, and parks
  poison-pill jobs in an inspectable terminal place (DLQ / dead set). None
  promises exactly-once; SQS FIFO's "exactly-once processing" is a 5-minute
  *producer-side dedup window*, nothing more
  ([SQS at-least-once](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html),
  [Sidekiq: "no exactly-once guarantee at all"](https://github.com/sidekiq/sidekiq/wiki/Best-Practices),
  [Tyler Treat, *You Cannot Have Exactly-Once Delivery*](https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/)).
- **Schedulers** (Kubernetes CronJob, Quartz, Airflow, systemd/anacron,
  GitHub Actions): missed-fire policy is a named design axis. Every system
  that catches up **defaults to coalescing** — one run for many misses — and
  full backfill is always opt-in with a thundering-herd warning
  ([systemd `Persistent=true`: "multiple missed runs result in a single
  activation"](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html),
  [Quartz misfire instructions](https://github.com/quartz-scheduler/quartz/blob/main/quartz/src/main/java/org/quartz/Trigger.java),
  [K8s CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)).
  GitHub Actions itself documents that scheduled fires are delayed **and
  dropped** under load with no catch-up of its own
  ([docs verbatim](https://github.com/github/docs/blob/main/data/reusables/actions/schedule-delay.md)).
- **Workflow orchestrators** (Temporal, Step Functions, Airflow/Argo/
  Prefect): the hand-off patterns all have names — pull-based task queues,
  activity heartbeats, **single-use task tokens** for external callbacks,
  durable timers for "wait 2 days", trigger rules (`all_success` vs
  `all_done`) for joins. Temporal's honest formulation is ours too:
  exactly-once *state transitions*, at-least-once *activity execution*,
  idempotency required
  ([Temporal activities](https://docs.temporal.io/activity-execution),
  [SFN `waitForTaskToken`](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).
- **Leases without CAS** (Kleppmann, Chubby, ZooKeeper, Gray & Cheriton):
  a lease alone cannot stop a *stalled* holder from acting after its lease
  was reaped — the fix is a **fencing token the downstream resource checks**,
  and where the resource can't check one, the fallbacks are idempotent
  effects, verify-after-write, and a cooldown before re-grant (Chubby's
  lock-delay)
  ([Kleppmann](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html),
  [Chubby paper](https://static.googleusercontent.com/media/research.google.com/en//archive/chubby-osdi06.pdf)).
- **GitHub-issues-as-queue prior art**: this is a *named, GitHub-blessed
  pattern* — **IssueOps**, explicitly modeled as a finite-state machine over
  labels
  ([GitHub blog](https://github.blog/engineering/issueops-automate-ci-cd-and-more-with-github-issues-and-actions/)).
  The prior art also documents exactly the races we designed around: label
  *set* writes clobber concurrent changes
  ([cli/cli#4861](https://github.com/cli/cli/pull/4861)), the search index
  lags minutes to hours
  ([staff-confirmed](https://github.com/orgs/community/discussions/13516)),
  duplicate `labeled` events are normal
  ([events docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)),
  and the platform's only true CAS primitives are **git ref creation** and
  (bot-mediated) assignment
  ([actions-mutex](https://github.com/shogo82148/actions-mutex),
  [triagebot](https://forge.rust-lang.org/triagebot/issue-assignment.html)).

## 2. Decision by decision — validated, named, or challenged

**The occurrence guard (§5) is the mainstream default, with a name.** "Most
recent anchor only, one coalesced catch-up run, no backfill" is precisely
systemd `Persistent=true` + anacron's timestamp check, Quartz's
`FIRE_ONCE_NOW` (its *smart-policy default* for cron triggers), and K8s
`startingDeadlineSeconds` behavior. The taxonomy also clarifies what we're
*not* building: Airflow can backfill because every occurrence has durable
identity (the data interval / logical date) — the very thing our design
deletes with the slot id. That is coherent: backfill is the one capability
occurrence identity buys, and none of our tasks wants it (a stale poll or a
window-scoped sweep re-covers its ground by construction). If a future task
ever needs true backfill, that is the signal to give occurrences identity
again — not before.

**The claim lease (§6.2) is a visibility timeout; earliest-claim-wins is
verify-after-write.** SQS's visibility timeout, BullMQ's lock, Celery's
Redis `visibility_timeout` — same shape: nobody detects a dead worker faster
than its lease expires, so *"pick the lease as your acceptable redelivery
latency, not as the longest possible job"*
([SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)).
That maxim is finding **F4** stated from outside: a 1h executing-leash
reclaimed daily is a lease evaluated 24× too slowly; riding the tick is the
literature-conform answer. The claim-comment protocol itself is what the
lease literature calls verify-after-write, and Kleppmann's warning names our
residual exposure precisely: a **stalled** executor (not dead — a hung
Actions runner) can act after its claim was reaped, and no label can stop
it. Our mitigations are the canonical non-fencing ones — idempotent effects,
the precondition re-run, and the agent-side lease at the next hop — plus one
upgrade available cheaply: the claim comment's id is a natural **fencing
token surrogate** (downstream comments/PRs can name the claim id they act
under, so the janitor and peers can ignore work bearing a superseded claim).
Worth doing only if a stalled-executor incident ever actually occurs.

**BullMQ's sharpest lesson: a worker can "die" without dying.** Its stalled
mechanism exists because a CPU-blocked event loop stops renewing the lock
while the job is still running — double execution by *hang*, not crash
([BullMQ stalled jobs](https://docs.bullmq.io/guide/jobs/stalled)). Our
equivalent: an Actions runner that hangs past the 1h leash while its prework
still runs. The reclaimed item re-runs prework beside the zombie. Prework
re-entrancy (F12) covers sequential re-runs; *concurrent* overlap is the
stalled-worker case, and our answer is the platform's job timeout (the
executor workflow's `timeout-minutes` must be ≤ the executing leash, so a
hung runner is killed before its claim is reaped — a constraint the design
should carry into implementation).

**The agent-side lease (F5) is the task-token pattern, minus the platform.**
Step Functions' `waitForTaskToken` callbacks are single-use — a second
`SendTaskSuccess` with the same token is *rejected*, giving first-writer-wins
on the callback; Temporal dedups by workflow ID at creation
([SFN](https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html)).
Our invocation nonce + earliest-agent-claim-wins is the same shape built
from comments, because GitHub mints no single-use tokens. If the CCR
session-creation API supports an **idempotency key** (the Stripe-header
pattern, now an IETF draft), the executor should pass the nonce as one —
that would collapse the duplicate at creation instead of at claim time, and
the agent lease becomes the backstop rather than the mechanism. Worth one
API-docs check at implementation time.

**Retry policy (F3) matches the field's split between error-retries and
crash-loops.** Every queue bounds the two separately: SQS `maxReceiveCount`,
Sidekiq's 25 error-retries *vs* 3-orphan-recoveries-in-72h kill, BullMQ
`attempts` *vs* `maxStalledCount: 1`. Our `handoff-attempts` counter bounds
the crash-ish loop; `needs-human` is our DLQ — terminal, inspectable,
human-replayed, never silent deletion, never infinite retry. One refinement
worth taking: retries should back off **with jitter** (Sidekiq's
`count⁴ + rand`, Celery's capped full jitter) — our tick cadence is the
backoff, and the tick minute is already repo-hashed, which is the jitter.
Nothing to add; noting the correspondence.

**`Blocked-by`/`Not-before` (§9) are durable timers + join edges; S18 is a
named problem.** "Wait 2 days then validate" is Temporal `workflow.sleep`,
SFN `Wait`, Argo `suspend.duration` — always a persisted timer, never a
sleeping process; ours is a body field the tick polls, the same thing at
1/hour resolution. The join semantics question has a vocabulary: Airflow
trigger rules (`all_success` deadlocks on one failed branch; `all_done` is
the join that tolerates it). Our "closed is closed, outcome checked by the
follow-up's own precondition" is `all_done` + a guard — the deadlock-free
default — and S18's stuck-fan-in is the literature's known `all_success`
failure mode surfacing through the *janitor* instead of a trigger rule.
Argo's `depends` expressions (`A && (B.Succeeded || B.Skipped)`) show what a
full vocabulary looks like; at our scale the precondition *is* that
expression, written in code, which is strictly more expressive and needs no
new syntax.

**Native GitHub dependencies changed under us.** Issue dependencies
(blocked-by/blocking) went **GA in Aug 2025, fully supported in API and
webhooks**
([changelog](https://github.blog/changelog/2025-08-21-dependencies-on-issues/)),
and sub-issues have a REST API since Dec 2024. The design's §9 assumed
mirror-only value; the primitives are now real enough to *be* the edge
store. The body fields stay the parsed truth (platform-agnosticism is a
stated goal, and body fields survive any tracker), but the tick mirroring
into native dependencies is now cheap and buys the graph UI for free —
upgraded from "where available" to "do it" in §9.

**Label mechanics: one hard rule imported verbatim.** Label writes must be
granular — POST-add / DELETE-remove named labels, **never** the
whole-set write (PUT, GraphQL `updateIssue`) — because the set write clobbers
concurrent transitions from a stale snapshot; gh's own CLI had this bug
([cli/cli#4861](https://github.com/cli/cli/pull/4861)). Now stated in
DESIGN §4. The search-index lag that S6/F11 flagged from first principles is
confirmed empirically: staff describe minutes of lag as normal and "for the
API, the delay may be much longer" — `list_issues` + label filter is the
only trustworthy queue read.

**A stronger claim primitive exists if we ever want it: ref creation.** Git
ref creation is per-ref atomic — push succeeds or "Reference already
exists" — and prior art uses it as the platform's one true mutex
([actions-mutex](https://github.com/shogo82148/actions-mutex),
[github/branch-deploy's lock branches](https://github.com/github/branch-deploy)).
A claim could be `refs/claudinite/claim/<issue-number>`: genuine
first-writer-wins CAS, no comment-ordering protocol at all. Costs: needs
`contents: write` (executors have it; agents would claim via the API), and
it moves queue state out of the issue — the one place §2 promised everything
would live — into refs a human never looks at. Recorded as a §15 option;
recommendation is to keep comment leases (visible, sufficient at our
concurrency) unless a real lost-race incident says otherwise.

**Scheduler facts that touch us directly.** GitHub documents scheduled-fire
*dropping* (not just delay) and the 60-day auto-disable on quiet public
repos — both already known to this repo (`github-actions-scheduling` skill,
the fleet-freshness sweep exists precisely because self-scheduling can't
detect its own absence); the community's standard mitigations (off-:00
minute, `workflow_dispatch` fallback) are exactly the vendored workflow's
existing shape. The literature adds one framing worth keeping: Kubernetes'
blunt *"two Jobs might be created, or no Job might be created… Jobs should
be idempotent"* is the correct posture for anything cron-adjacent, and it is
the posture the guards + precondition re-run already take.

**IssueOps convention check.** The pattern's conventions largely match ours
(namespaced labels as FSM states, permission-gated commands, reactions as
acks). One divergence, deliberate: IssueOps leaves terminal states unlabeled
(no outgoing transitions → no label); we label outcomes
(`outcome:done|delivered|obsolete`) because our terminals are *queryable
census data* (the usage fold, the janitor's health review), not just FSM
states. Divergence noted, kept.

## 3. The mid-window-firing question (F10), informed

Airflow's sensor modes give F10 its vocabulary: **poke** (hold a slot,
check often) vs **reschedule** (wake, check, sleep — cheap, latent), and
deferrable operators exist because thousands of idle pollers were the real
cost at their scale. Our tick *is* a reschedule-mode sensor with a 1h poke
interval and a shared probe (one signal collection covers every unfired
task), so the per-tick marginal cost is API reads only. The literature
doesn't decide the owner call, but it prices it: continuous evaluation is a
sensor pattern engines consider normal *when the poll is cheap and shared* —
which ours is; once-per-occurrence is the anacron model. Both are legitimate;
the deciding factor is whether "work appearing at 09:00 waits for tomorrow"
ever actually hurt us, and the run history can answer that before the flag
ships.

## 4. Deliberately left on the shelf

Named, so the next reader doesn't re-derive and re-propose them:

- **Heartbeat renewal** (BullMQ lock renewal, SQS `ChangeMessageVisibility`,
  Temporal heartbeats): our executor iterations are minutes long; a static
  1h leash bounds them fine. Revisit only if prework ever legitimately runs
  longer than the leash.
- **Fencing tokens checked at every resource** (Kleppmann's full remedy):
  GitHub can't check them; our effects tolerate stale actors by idempotency
  + precondition re-runs; claim-id-in-comments is the recorded cheap upgrade.
- **Backfill / occurrence identity** (Airflow data intervals): no task wants
  replay of missed periods; window-scoped preconditions re-cover ground.
- **Quorum / deadline joins** (Argo `depends`, trigger-rule zoo): fan-ins at
  fleet size 20 escalate through the janitor instead (S18, on record).
- **Multi-node lock services** (Redlock, ZooKeeper): our serialization needs
  are met by one Actions `concurrency` group and issue-level leases.
- **A message broker of any kind**: the queue's entire read/write surface is
  the issue tracker, on purpose — the `SKIP LOCKED` literature's core insight
  transfers (keep the claim and the record in the same store so state never
  splits), even though the locking primitive doesn't.

## 5. Changes fed back into DESIGN.md

1. **§4** — label writes are granular add/remove only, never set-writes
   (cli/cli#4861 class).
2. **§9** — native issue dependencies upgraded from optional mirror to
   standard mirror (GA + API/webhooks since Aug 2025); body fields remain
   the parsed truth.
3. **§6** — the executor workflow's `timeout-minutes` must be ≤ the
   executing leash (the stalled-worker overlap bound).
4. **§15** — new option on record: ref-creation CAS claims; new note: pass
   the invocation nonce as a CCR idempotency key if the API takes one.

Everything else in DESIGN.md stands as validated — in several places the
literature supplied the pattern's proper name, which the doc now uses.
