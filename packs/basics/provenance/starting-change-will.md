## 2026-09-15 · born · Track a change worked on now by its PR, not an issue (#2016)
- **Reason:** an issue for a change that starts now is bookkeeping nobody reads; the pull request
  already carries the context in its body and thread.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Starting a change you will work on now".
- **Rejected:** keeping the old rule's two enforcement points. Neither the `task-lifecycle` check
  nor the `pull-request-without-closing-line` guard can tell whether an issue exists.
- **Landed:** #2016 · pack version 60915.1.
