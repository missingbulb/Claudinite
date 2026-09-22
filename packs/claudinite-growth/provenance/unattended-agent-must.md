## 2026-07-08 · born · Fan out fleet maintenance via plain subagents, not the Workflow tool (#169)
- **Reason:** the scheduled fleet routine stalled on step one behind the Workflow tool's opt-in
  dialog, which no unattended run can answer.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "An unattended agent must
  never invoke a tool".
- **Landed:** #169 (Closes #168).
