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
