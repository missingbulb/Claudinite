## 2026-09-16 · born · converted from references.md (check:subagent-branch-named-git)
- **Reason:** 2026-09-15's capture on #2074 (15:04:05–15:05:24): a worktree-isolated child was
  dispatched "on a branch named `perf/git-fixtures`" and could not create it — `git checkout -b`,
  `git switch -c`, a script wrapper, a `command -v g''it` splice, `git branch -m` bare and quoted,
  and a direct write of `.git/refs/heads/perf/git-fixtures` were all refused across eight attempts,
  while `git switch -c perf/xtmp` passed first try. The child handed back asking the parent to
  rename the branch for it. `RULES-73` covers varying the *wrapper*; nothing covered the argument
  that carries the token, and the dispatch is the only moment the name can still be changed cheaply.
- **Mechanism:** a check
- **Retire when:** Retire the check if the isolation guard stops reading the word `git` out of a
  command's arguments.
