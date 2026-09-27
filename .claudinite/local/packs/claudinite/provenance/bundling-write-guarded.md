## 2026-09-27 · born · a heredoc write chained to a guarded run is discarded whole
- **Source:** capture 2026-09-27 session fbad704d (#2373), a Bash call blocked
  `skill-not-loaded-for-call Bash needs running-the-suite`; reproduced in this run, where `|wget`
  inside heredoc data forced `fetching-from-the-web`.
- **Reason:** the write and the run went out as one command, the guard refused the call, and the
  test file the heredoc would have written never existed; the loss is silent, since the guard's
  message names only the skill to load.
- **Mechanism:** prose. Over the window's captures 132 of 1,084 Bash calls carry both a write and a
  guarded token, and the guard blocks only the session's first, so a check would fire mostly where
  the call succeeded.
- **Actor:** run 36347796455, work item #2377.
- **Model:** claude-opus-5
- **Retire when:** #2380 lands, so the guard reads the command's code rather than its whole
  string and data carrying a guarded token no longer blocks the call.
