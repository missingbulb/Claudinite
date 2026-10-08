## 2026-09-25 · born · 28 refused compound-git Bash calls dispatching worktree-isolated PR subagents (#877)
- **Source:** conversation-logs capture `pr-846` (growth-extract window: substantive commits
  407b088, 5046beb, 650a247, 505fa83, 3ae4173, daf5d87, c158769).
- **Reason:** the session orchestrating worktree-isolated subagents to implement PRs
  #846/#847/#852/#853/#850/#863 hit the isolation guard's (quote dropped) refusal 28 times
  in this one log, each time for a Bash call naming `git` inside a heredoc, an `&&` chain or a pipe;
  the guard already states the fix ("split it into plain, separate commands") but the session
  re-discovered it by trial each time rather than composing standalone commands up front.
- **Mechanism:** RULES.md prose under (quote dropped) — the guard's refusal is about how a live
  Bash call is composed at runtime, not a property of a committed file, so no check can carry it.
- **Retire when:** a capture shows a dispatching session composing git-naming commands as separate
  calls from the start, with no further isolation-guard refusal of this shape recurring.
- **Actor:** the growth-extract run, item #877.

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
