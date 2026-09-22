## 2026-09-22 · born · the owner pulled the usage-review design back from acting twice (#2230)
- **Source:** the capture behind #2084, 2026-09-21, session 9f359833-9df1-5a13-abcd-153d52dd8235.
- **Reason:** the design was put up as detect-and-mitigate. The owner asked for the mitigations to
  come out (separate the analysis, still reach every conclusion and recommend, but change
  nothing), saying they were worried about an analysis "applying changes automatically based on wrong
  decisions we make in the doc now", and that a fix should wait until the cause is known for sure. A
  standing mechanism reapplies its bet every cycle, so a mitigation is not one wrong change but a
  wrong change on a schedule; the detection is right or wrong once and readable by a person either
  way.
- **Mechanism:** prose in this pack's standing-decisions section. No check can read whether a design
  proposes to act, and the moment it must fire is while a design is being written.
- **Retire when:** a mechanism ships a mitigation whose cause is inferred and it holds up over a
  quarter.
- **Actor:** @missingbulb (owner), across the #2084 design sessions.
- **Model:** claude-opus-5
