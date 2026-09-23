## 2026-07-11 · born · Fleet bootstrap sweep: adopt uncovered + re-bootstrap/align members, census executor, explicit delivery flag (#225)
- **Reason:** the coverage census needs a token spanning every repo, which no session holds;
  wrapping it as a dispatch-only workflow keeps one schedule and one orchestrator.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "When a routine needs a
  capability its own".
- **Landed:** #225 (Closes #224).

## 2026-07-19 · reworded · google-identity: prose → skill-owned checks, enforcement-silent canon docs, shared line-scanning lib (#350)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #350 (Refs #303).
