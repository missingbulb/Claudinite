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

## 2026-09-22 · declined · a canon pack's RULES.md edit owes its README rule-index row
- **Source:** #979 proposed it; the owner's review on #987 answered "drop this rule".
- **Reason:** the owner turned it down outright.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · .github/workflows/ files can only arrive seeded at adoption
- **Source:** #979 proposed it; the owner's review on #987 answered "incorrect".
- **Reason:** the claim is false, so there was nothing to keep.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · tightening a vocabulary the engine and vendored packs share
- **Source:** #979 proposed it; the owner's review on #987 answered "don't understand this".
- **Reason:** the rule could not be read, and a rule a reader cannot follow costs every session and
  buys nothing.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · where setup-time state or a new capability lives
- **Source:** #979 proposed it; the owner's review on #987 answered "written similarly before".
- **Reason:** already covered by the standing distribution-model rule.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · a test walking git history must guard a shallow clone, as a check
- **Source:** the conversion pass in #1779, which authored `history-test-shallow-guard` and withdrew
  it.
- **Reason:** it fired on six real tests, every one walking the history of a fixture repo it created
  itself, and fixture history cannot be told from the repository's by a static signature. The prose
  bullet stays.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · a pack RULES.md bullet requires a co-changed README, as a check
- **Source:** the upgrade pass in #2110.
- **Reason:** measured over the 60 commits in the checkout, four touched a pack's `RULES.md` bullets
  and one of those rewords a lead-in rather than adding a rule, needing no README change;
  `requireCoChange` cannot see a net count, so the check would be wrong on one real case in four.
- **Actor:** @missingbulb (owner).

## 2026-09-23 · declined · promoting `pipe-tail-hides-exit` out of advisory
- **Source:** it fired in five of the 2026-09-22 window's captures, several calls each, and no
  session acted on it.
- **Reason:** the check is the canon `basics` pack's, and this run writes only local packs; the
  severity call is the usage-review's.
- **Actor:** the growth-extract run over the 2026-09-22 window.

## 2026-09-23 · declined · a shape for a state-transition table put to the owner
- **Source:** #2262, where the owner reshaped one table over three rounds - full label names,
  conditions as pseudocode naming the surface read, writes as `+ label`, one clause per line.
- **Reason:** how a summary is shaped is the owner's own preference, which is injected per session
  and goes stale the moment a pack copies it.
- **Actor:** the growth-extract run over the 2026-09-22 window.

## 2026-09-23 · declined · converting `changing-guidance-produced` to a check
- **Source:** the upgrade pass over this run's own additions.
- **Reason:** class G - the trigger is "guidance that produced a bad artifact", a judgment; a work
  rule reading "prose edited, no Agent dispatch" fires on every rewording and guesses intent.
- **Actor:** the growth-extract run over the 2026-09-22 window.
