## 2026-09-27 · born · a conflicted PR gets no pull_request run, and reads as a dead trigger
- **Source:** capture 2026-09-27 session d2161569 (#2375): the same diagnosis twice in one session:
  ClaudiniteWebsite#708 and Claudinite#2375 each showed no checks on a pushed head, both were
  conflicted with their base, and CI started on the push that merged the base in.
- **Reason:** absent checks read as a broken trigger, so the session spent a workflow-file read and
  a push audit before reaching mergeability; the existing merging-pr-has rule fires when merging an
  old PR, not while waiting on CI.
- **Mechanism:** prose. The trigger is a tool result carrying an empty check-run list, which no
  pattern can select.
- **Actor:** run 36347796455, work item #2377.
- **Model:** claude-opus-5
- **Retire when:** GitHub reports a skipped-for-conflict run on the PR, so the absence is no longer
  what a reader sees.
