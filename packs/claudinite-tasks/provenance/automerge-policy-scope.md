## 2026-08-30 · born · Auto-merge policies: expected_outcome 'none'/'pr' plus a granular, built-ins-first automerge field (#1464)
- **Source:** #1459, whose research grounds the diff-class vocabulary - semantic inertness, blast
  radius, change direction, path deny-lists.
- **Reason:** once a task may arm its own auto-merge against a declared policy, the arming run's own
  measurement is the only thing between a mis-measured diff and an unreviewed merge. The check
  re-measures the diff against the stamped policy so a mis-measured arm goes red before GitHub's
  queued auto-merge fires, and no granular policy can cover a change to the policy sources
  themselves.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a blocking work-scope check,
  `packs/claudinite-tasks/workRules/automerge-policy-scope.mjs`, self-gating on the
  `Claudinite-Automerge-Policy` commit trailer a landing run stamps - no trailer, no findings, so a
  wide pull request left open for review stays green.
- **Landed:** #1464 (Closes #1459) · pack version 60830.5.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
