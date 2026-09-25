## 2026-09-21 · born · unconsumed background sleeps nearly wrote a fabricated timing claim into a commit (#807)
- **Source:** conversation-logs capture `pr-795` (growth-extract window: substantive commits
  0341e10, 79ec340, d6e2f56, 52ffdc3, 9245309, 51c58c3, eec1b45, a5e5e0f, 2c9e5b6, 991af3f).
- **Reason:** the session fired three overlapping `run_in_background` sleeps (150s/180s/210s)
  roughly 20-30s apart without waiting for any to elapse, then re-polled the CI job almost
  immediately and concluded `ui-requirements` had been (quote dropped) drafting a commit
  message with that hang claim plus a fabricated (quote dropped) It caught itself before
  pushing by checking real timestamps: the background sleeps weren't actually blocking, so the
  re-poll happened seconds after firing them, not minutes; the lane's real measured time was
  56.8s/58.0s before and 57.5s after — neither claim was true. It rewrote the commit before it
  shipped, but the detour cost a full debugging round on a self-inflicted false lead. This sharpens
  the existing (quote dropped) rule (the
  #349-derived section above it in RULES.md): that rule is about wasted wall-clock from overlapping
  sleeps, this one is about the *data-integrity* failure mode of also trusting the elapsed feel of
  that wait for a factual claim written into a commit.
- **Mechanism:** `RULES.md` prose, placed directly after the (quote dropped) section it
  extends — not a declared check, since verifying a commit's timing claim against ground truth
  needs the job's own logs, which a static check can't reach.
- **Retire when:** the session's own timing-claim habit is reliably backed by a captured
  `date`-based start time compared against the job's own `started_at`/completion timestamp before
  any duration is written into a commit or PR body, with no further near-miss.

## 2026-09-24 · reworded · trimmed to trigger and action
- **Reason:** the owner asked to trim rule prose to zero story ("Trim to zero, unless crucial to
  understand severity"); the incident history lives on this file.
- **Actor:** the owner.

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
