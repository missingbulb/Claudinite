## 2026-08-11 · born · the operator's lever to force every member to baseline now (#750)
- **Source:** `fleet-add-missing-packs`' first real run parked for a human, because its
  dispatch asked the enforcer's own executor to act on four member repos and that session is
  correctly scoped to the enforcer alone.
- **Reason:** the fan-out model is what works: the enforcer presses each member's own scheduler
  button and everything agentic happens inside the member. Under per-project scheduling the fleet
  needs no push in the ordinary case; this is for the un-ordinary ones.
- **Actor:** @missingbulb (owner).
- **Mechanism:** an agentless task on the ordinary work-item queue rather than a workflow, never due
  on any cadence, run only from an item a person creates. It retired the standalone workflow and the
  `.github/` managed copy that only the withhold-and-hand-to-the-agent path could deliver.
- **Landed:** #750 (Closes #749).

## 2026-08-23 · reworded · the lever reports outcomes, not dispatches (#1294)
- **Reason:** a dispatch returning 204 says a run was queued and nothing more. A report built from
  those 204s describes the sweep's own outgoing calls while reading as fleet-wide delivery: one run
  announced 13 fired, 0 failed where 9 of the 13 took nothing. The sweep now follows each member to
  a terminal condition read off the member itself and fails the run when a dispatched member never
  got there. `already-current` is kept a success of its own, because folding it into a failure
  reports a fault that is not there and into `converged` claims work that did not happen.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1294 (Closes #1293) · pack version 60823.2.

## 2026-09-07 · policy-changed · the dormancy pre-filter is kept, against the brief (#1851)
- **Reason:** dropping it was asked for and two reasons said not to. It was never a second
  authority, since it calls the member's own predicate, so there was no disagreement to remove, only
  a dispatch per dormant member spent learning what the declaration in hand already said. And it
  would silently break the forced-include channel: the member's own gate stops a woken run too, so
  every forced dispatch would self-skip while the sweep reported it fired.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the sweep keeps calling the dormancy predicate the `claudinite-tasks` pack now
  publishes, rather than the engine setting that carried it before.
- **Landed:** #1851 (Closes #1845) · pack version 60907.1.

## 2026-09-07 · reworded · it imports the measurement half under its own name (#1855)
- **Reason:** the module the lever depends on was two thirds measurement and one third issue family;
  with the issues gone, leaving it named for a mechanism it no longer has is the trap that has
  broken a check against an export removed under it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1855 (Closes #1854) · pack version 60907.2.
