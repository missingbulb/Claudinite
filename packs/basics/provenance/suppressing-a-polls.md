## 2026-09-24 · born · given a file of its own from an unmarked section
- **Source:** the unmarked RULES.md section "Watching a workflow or scheduler run", whose history
  predates this date.
- **Reason:** a suppressed poll-condition stderr hides exactly the diagnostic that would explain a
  never-satisfied wait.
- **Actor:** the owner.
- **Mechanism:** a rule in the local pack's RULES.md; nothing a file edit predicts brings a session
  to it, so it stayed prose there. A sibling half of the same rule (never invoking a missing CLI)
  converted cleanly to an action-scope tool-call check; this half could not, since the check
  surface judges a tool call's input, not whether its output was piped through a stderr-dropping
  redirect.

## 2026-09-27 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
