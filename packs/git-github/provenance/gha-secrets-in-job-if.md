## 2026-09-01 · born · converted from references.md (check:gha/secrets-in-job-if)
- **Reason:** The behaviour: `secrets.*` is not available in a job-level `if:`, so a job gated on a
  secret cannot evaluate its condition and **fails red** rather than skipping. The point of the
  repository-variable form the check's fix names is that the job is **skipped (neutral)** until
  configured, which keeps the default branch green for anyone who has not set the optional
  integration up — the reason the check is blocking rather than advisory. Converted from
  `git-github-advanced`'s prose in #552, which deletes a paragraph whole once a check covers it —
  the failure message owns the rule and the check's own text owns the remedy, so what is recorded
  here is the platform behaviour the check encodes and the condition that would retire it.
- **Mechanism:** a check
- **Retire when:** Reaffirm against GitHub's context-availability documentation; retire only if
  secrets become readable in a job-level `if:`.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
