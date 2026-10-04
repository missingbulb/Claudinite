## 2026-09-28 · born · two test files refuse the shallow clone a session starts from
- **Source:** capture 2026-09-28 session f6b90b34 (#2383): the whole suite came back 4084/2 on
  `engine-pack-lane-shims` and `member-runnable-doc-paths`, both refusing a shallow checkout;
  unshallowing and re-running the two took 9s. Reproduced in this run's own fresh checkout.
- **Reason:** the two guard themselves and fail loudly, as the tests here are meant to, but the
  session pays the full ~2.5min run to be told, then diagnoses two reds that read like a regression
  - and the only other ways to learn it are the failure text and the clone's depth, neither of which
  a session looks at before running tests.
- **Mechanism:** a bullet on the running-the-suite skill, which already force-loads on `Bash.command
  /\bnode\s+--test\b/` - the exact call - so the rule arrives at the moment with no standing context
  cost.
- **Rejected:** a session-start step that deepens every checkout, which charges every session for
  the two test files most never run; and an action guard on the same call, which cannot read the
  clone's depth from the command string and would nudge every deep-clone run too.
- **Actor:** the growth-extract run over the 2026-09-28 window, work item #2386.
- **Model:** claude-opus-5
- **Retire when:** neither test needs `origin/main`'s full history, or the checkouts sessions get
  here are no longer shallow.

## 2026-10-04 · reworded · the clone depth varies, so test for `origin/main~50` before deepening (#2438)
- **Source:** revalidation probe: this session's clone was shallow (`.git/shallow` present) but 78
  commits deep, `origin/main~50` resolved, and the whole suite ran 4111/4111 green with no
  deepening. Both tests guard on `rev-parse ${TRUNK}~50`, so they refuse only a clone shallower than
  that.
- **Reason:** the rule said every session's clone fails both tests; it only does when shallower than
  50 commits.
- **Actor:** the rule-revalidation run, work item #2438.
- **Model:** claude-opus-5-5
- **Retire when:** neither test needs `origin/main~50`, or sessions' clones reliably carry that
  depth.
