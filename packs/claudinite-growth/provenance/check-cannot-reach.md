## 2026-09-22 · born · nothing in this tree is in its scope, so no run of it could have fired (#2246)
- **Source:** the owner's #2246, deferred from #2214 with a window of evidence behind it.
- **Reason:** of the first production review's 51 `check-never-fires` findings, 12 were structurally
  inert here and one scanned a directory that does not exist. A check that ran 2276 times and caught
  nothing and a check that never applied were the same number in the record, so every one of them
  read as evidence; this names that class as its own finding, with a recommendation, rather than
  carrying it forward beside the checks that really are nets.
- **Actor:** the Claudinite queue, run as work item missingbulb/Claudinite#2246.
- **Mechanism:** a declaration in `usage-rules.json` reading the live `reach` figure - how many
  applications a check's own declaration has in the tree, from the engine's own selection code.
  `window: "now"` and no floor, because reachability is a property of the tree rather than of a
  window: no amount of activity makes an unreachable check judgeable, and none makes it unjudgeable.
- **Rejected:** counting opportunities in the runners and folding them out of the transcript, which
  #2246 sketched. That would measure reach per run rather than per tree, and cost the clean world
  sweep its silence plus a per-rule line in every session's capture, for a number that moves only
  when the tree does.
- **Retire when:** the class it names is empty across a season of reviews - every check declared
  here reaches something - or its findings produce no merged proposal.
