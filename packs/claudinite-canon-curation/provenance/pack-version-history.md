## 2026-09-05 · born · the version log becomes a derived record (#1726)
- **Source:** #1723, where versions stopped being cut inside pull requests: once no change writes
  its own row, the row has to come from somewhere.
- **Reason:** which pull requests a version shipped is a fact of the base branch's history - the
  first-parent commits between one bump and the next - so a weekly task retraces it and appends only
  the rows a version lacks, on a self-landing pull request whose policy covers those files alone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a scheduled task, weekly and gated on commits under packs/, agentless: the squash
  subject carries the pull request's title, so nothing needs judgment. `supersede_existing_pr`,
  since each run recomputes every missing row and so contains the previous run's.
- **Rejected:** every pull request writing its own row (two changes in flight claim one number, and
  the row conflicts on the same line).
- **Retire when:** pack versions stop being cut on the base branch after the fact.
- **Landed:** #1726 (Refs #1723, #1689) · pack version 60905.2.

## 2026-09-21 · policy-changed · the record it writes moves under each pack's `provenance/`
- **Source:** the owner's call, on #2190's review: the version log is read by maintenance and never
  by a session or a member, like the decision log, so it belongs beside it.
- **Reason:** one folder holds everything the shelf keeps for its maintainers and nothing a member
  receives; the log stops vendoring with the rest of that folder, and a row landing can no longer
  read as a shipping change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the task's automerge class matches `packs/<id>/provenance/VERSIONS.md` alone, the
  path spelled once in `pack-versions.mjs` (`versionsPath`) for the writer, the check and the class.
