## 2026-09-21 · born · a polling loop whose condition is already true is a sleep in disguise
- **Source:** the rule's own text; the earliest pack-local commit touching it is the version bump
  ea4b096, so this date is DERIVED rather than observed and the rule is older than it.
- **Reason:** an `until` loop reads as waiting for something whatever its condition, so a condition
  true on the first check passes review as a wait and is a blind sleep.
- **Mechanism:** prose, because the condition's quality is a judgment at writing time that no guard
  can read off the call.
- **Actor:** run of the session that cut its trailing clause (@missingbulb, owner).
- **Model:** claude-opus-5
- **Landed:** commit ea4b096.

## 2026-09-22 · reworded · the trailing clause restated a blocking guard, and named it
- **Source:** the sweep asking of each of the 33 guards whether prose still carries what it already
  blocks, run while accounting for what a session loads beyond its rules.
- **Reason:** the clause said a bare `wait` in a later Bash call is a blind wait because each call
  is a fresh shell — which is `bare-wait-in-fresh-shell`'s own failure message, on a BLOCKING
  guard that fires at the call itself. The rule's own subject, a condition already true on its first
  check, is not something any guard can see, so that half stands.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
