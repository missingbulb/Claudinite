## 2026-09-06 · born · converted from references.md (unattended-agents-4)
- **Reason:** #1739: `tidy-repo/tidy-issues` read "for each issue in scope, run the
  single-issue-triage skill" as one subagent per issue; the children re-derived the same view of
  `main` to return verdicts that were mostly `left`/`unchanged`, and the fan-out spent the worker's
  whole run bound, so the dispatch issue was never converged and the janitor parked it hours later.
- **Mechanism:** prose, a guideline of the unattended-agents skill
- **Retire when:** Reaffirm while fan-out is a subagent dispatch the parent's clock pays for.
