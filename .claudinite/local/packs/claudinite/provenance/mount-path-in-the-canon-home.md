## 2026-09-13 · born · converted from references.md (check:mount-path-in-the-canon-home)
- **Reason:** 14 sessions across the captured corpus ran an engine module through
  `.claudinite/shared/…` from this repo's root and got `Cannot find module` —
  `check_the_work`/`check_the_world` mostly, but `converge-item.mjs` and `session-end-command.mjs`
  too, and twice on 2026-09-13 alone (sessions 809b13de and f44b0ffb). The mount path is what
  `claudinite-lifecycle`'s rules and the queue's instructions spell, correctly, for a member; the
  canon home has no `.claudinite/shared/` at all, so the sweep a session believed it ran never ran
  until it noticed the error and retried. Replayed over 558 sessions rooted here the guard fires on
  those 14 and nothing else — the `cd` into a cloned member or a scratch consumer tree, the
  two-root `||` fallback, and the path quoted inside a heredoc all stay silent.
- **Mechanism:** a check
- **Retire when:** Retire the check if the canon ever vendors itself.
