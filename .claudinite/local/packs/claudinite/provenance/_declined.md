## 2026-09-21 · declined · a rule for the GitHub MCP going "invalid session" mid-session
- **Source:** capture 2026-09-21T0846Z, session b4d88c99-6449-5448-9d26-22fdf4e814a1 (#2190, #2192).
- **Reason:** the MCP server answered "Error POSTing to endpoint: invalid session" to 15 calls over
  17 minutes, reads and writes alike, while a fresh session connected on its first try; the run
  correctly refused to route around it through the shell and reported the two API steps it could not
  take. A skill triggered on that result text, telling a session to stop after the first couple of
  failures, was drafted and dropped: one occurrence in the 41 captures this run read is a platform
  outage rather than a durable condition, and the retry cost is already the shape
  calling-anything-claudecoderemote states for the tool it was measured on. The next pass that sees
  it again has two data points and should land it.
- **Actor:** the claudinite-growth/growth-extract run on work item #2196.

## 2026-09-22 · declined · a local merge is no evidence about GitHub's mergeability
- **Source:** the capture behind #2001, 2026-09-21, session c4f829ba-759d-5a25-9310-f1684119a48b.
- **Reason:** the run read `mergeable_state: dirty` on four PRs that merged cleanly under local git,
  and blamed the `merge=ours` driver this repo's session-start hook configures, which GitHub does
  not honour. Re-measuring with the drivers off merged cleanly too, so the driver was not the cause
  and the flag was stale against a base sha from Sept 13. A rule written from the first reading
  would have taught a mechanism that was not operating; the residue, that the flag can be a stale
  computation, is one run's inference and waits for a second sighting.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2230.
