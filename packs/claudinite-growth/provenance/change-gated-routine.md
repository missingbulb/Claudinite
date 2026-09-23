## 2026-07-18 · born · unattended-agents: a change-gated routine must exclude its own writes from its triggers (#325)
- **Reason:** the planner optimisation hit the trap twice - the baselining commits scored as project
  work, and repo-tidy's nightly rewrite of its own tracker kept it inside the lookback window
  forever.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "A change-gated routine
  must exclude its own writes from its triggers, or it feeds itself.".
- **Landed:** #325 (Refs #323).
