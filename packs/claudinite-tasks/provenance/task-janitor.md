## 2026-08-07 · born · Three-responsibility task machinery: janitor split, precondition-only gating, prework rename, exec-status distillation (#675)
- **Source:** owner requirements 16-17 of 2026-08-06, which deliberately override parts of the
  existing per-project-scheduling and task-prework designs.
- **Reason:** the scheduler's maintenance pass was retired - the scheduler now only creates task
  issues - so recovery (stale escalation, dead-claim reclaim, lost-event re-arm) and the health
  review needed a home of their own. The stated trade is recovery latency: for a lost label event or
  a dead claim it grows from about an hour to up to a day.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a daily task in packs/basics, `agent_model: none`, a hard-coded worker over the
  dispatch module's unchanged pure rules.
- **Landed:** #675.

## 2026-08-24 · moved · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task moves into `packs/claudinite-tasks/tasks/task-janitor/`, the pack whose
  queue its sweeps repair.
- **Landed:** #1326 (Closes #1325) · pack version 60824.1.

## 2026-08-27 · reworded · Write the canonical spellings (#1385)
- **Reason:** a park stops being a pair. A needs-human label plus a sub-label could be half applied,
  which is a torn state of its own, so a park is one label written by one swap - and the janitor's
  sweep follows that, as every other writer does.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1385 (Refs #1119) · pack version 60827.3.

## 2026-08-30 · reworded · Close a park once a later run answers it; adopt-requested-packs lands its PR (#1454)
- **Reason:** a park is a question about a moment, and nothing ever revisited it - one unset routine
  token accounts for 22 open items in one member. Rule E closes a parked item whose task has since
  converged done strictly later, as judgment over history rather than the scheduler run's label
  mechanics. Scoped to the two park kinds that name a broken thing: approval and decision are
  excluded deliberately, because those carry content a person still owes an answer to and an
  approval park typically holds an open pull request. Rule F closes a park for a task that is gone,
  which the executor-side verdict could never reach, since a parked item is never picked again.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1454 (Refs #1452, #1453) · pack version 60830.4.

## 2026-08-30 · reworded · Close a work item stranded by a pack rename instead of parking it forever (#1466)
- **Reason:** an item carries its task twice - the id in its title and the worker path in its body -
  and only the id is canonicalized across a pack rename, so the executor's path guard refused such
  an item permanently and its failure park held the task's whole lane. Rule F's premise widens from
  "this task is not carried at HEAD" to "this repo cannot run this item at HEAD".
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1466 (Refs #1461) · pack version 60830.6.

## 2026-08-31 · reworded · A park can state what would end it, and the janitor closes it when it does (#1472)
- **Reason:** an approval park leaves the item open holding an open pull request named only in
  prose, and rule E excludes that kind precisely because a later clean run does not answer it. A
  park given a pull request now carries an end condition, and rule G reads that target's resolution
  - merged closes the item done, closed-unmerged closes it rejected.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1472 (Refs #1468) · pack version 60830.6.

## 2026-08-31 · reworded · A done terminal closes the issue it stands on, marked or filed (#1490)
- **Reason:** done is the one outcome meaning nothing is left for anyone to act on, so the sweep
  closes the issue it stands on. Every other terminal is unchanged: a park waits on a person.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1490 (Refs #1489) · pack version 60831.1.

## 2026-08-31 · reworded · The janitor closes a terminal nothing closed (#1528)
- **Reason:** every writer closes the issue in the same breath as stamping a terminal, so an open
  item wearing one is a transition that tore - and nothing recovered that state: it reads as
  finished to every other rule while sitting in the open queue's count forever. The close is the
  whole repair, at the status's own outcome, with no label written. Two guards against a converge in
  flight, which looks identical: an hour's clock, and the fresh read the stateless repair already
  makes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1528 (Refs #1526) · pack version 60831.7.

## 2026-08-31 · reworded · The janitor stops writing `decision`: rules B and D park failure (#1516)
- **Reason:** a dead session and a torn label swap are both things the machine noticed rather than
  choices a person made, and decision is the one park kind rule E can never supersede - so those
  parks could not be cleared by a later clean run and accumulated. Failure is also the blocking
  park, so the task's lane holds until a person has looked rather than filing a fresh occurrence
  each anchor. The janitor now stamps no decision park at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1516 (Refs #1515) · pack version 60831.8.

## 2026-09-06 · reworded · Judge a beating agent on its progress, not its punctuality (#1756)
- **Reason:** a beat resets the issue clock by existing, so once the agent phase beats, the clock
  alone makes every beating session immortal - including one wedged an hour in, where the signal has
  degraded from "work is happening" to "a process is alive". The beat already carries what separates
  them, so rule B runs its leash from when the note last changed, and from the issue clock for an
  item with no beats - which is every item filed before the beat existed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1756 (Refs #1752) · pack version 60906.2.

## 2026-09-06 · reworded · Janitor rule I: close a failure park nobody has answered in ten days (#1786)
- **Reason:** a failure park holds its task's lane, so while one stands the scheduler files no
  further occurrence - which makes rule E's answer, a later clean run of the same task, unreachable
  for exactly the kind of park it was written for. The clock answers them instead. Standing items
  only, structurally, since a qualified item, a manual task's item and an adopted issue are each
  somebody's own work that no clock answers, and never the three park kinds that are a person's
  inbox rather than a fault.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Rejected:** three weeks, the bound the change first carried; the owner called it down to ten
  days as enough for a park nobody has read.
- **Landed:** #1786 (Refs #1785) · pack version 60906.6.

## 2026-09-06 · reworded · The janitor is a fallback, and a rejected terminal closes its issue (#1836)
- **Reason:** the janitor's charter, written where the next author reads it: every rule there
  repairs something that already went wrong, no stage of a task's healthy flow runs through it, and
  an item somebody closed - park label and all - is finished rather than a state to repair. The
  ruling that follows: a pull request closed unmerged says the task was rejected, so rule G's
  unmerged half closes the item, retiring #1489's "a rejected terminal stands on the open issue"
  that rule H was already overriding a day later.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1836 (Refs #1835) · pack version 60906.16.

## 2026-09-15 · reworded · Measure a dead agent claim from the holder's own silence (#2039)
- **Reason:** the reclaim read the issue's updated timestamp, which any comment moves - a losing
  executor letting go, a person, a task's own bookkeeping - so a dead claim read as live and sat
  past the three hours its escalation comment promises. It measures from the holder's own claim or
  heartbeat trail instead, keeping the issue timestamp as the fallback where there is no liveness
  signal. This reclaim is the only backstop under the agent phase, because the routine fire API
  cannot answer whether the session is still running.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #2039 (Refs #2038) · pack version 60915.1.

## 2026-09-22 · policy-changed · the janitor asks whether the queue needs repairing (#2247)
- **Source:** W38's fold: 7 janitor items a week, every one closed the same hour having found a
  healthy queue, against a gate of `schedule:at-most-daily` alone.
- **Reason:** the janitor is the fallback lane - every run of it claims something already went
  wrong, and on most days nothing has. A cadence cannot decline, so the task was paying an issue, an
  executor run and a receipt per day to report that.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** a task-local `queue-needs-sweep` term over a new `queue` signal, the open work-item
  set that the `issues` collector deliberately hides. The term CALLS the janitor's own pure rules
  rather than restating their clocks, so the gate cannot drift from the sweep; the three rules
  needing a read a precondition must not make all act on a parked item, so any park holds. Every
  default lookup is permissive, making the term's claim set a superset of the sweep's - a spurious
  run costs one issue, a wrong decline costs a repair nobody is asked to make.
- **Rejected:** restating the rules' conditions in the term (a copied clock drifts, and this gate
  going quiet is silent); a standing rewritten issue for the health review (the work item is the run
  record every cadence term reads).
- **Retire when:** the janitor's rules stop being pure functions over the open queue, so the term
  can no longer call them.
- **Landed:** #2247
