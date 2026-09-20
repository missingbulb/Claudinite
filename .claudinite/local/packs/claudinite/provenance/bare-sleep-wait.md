## 2026-09-07 · born · converted from references.md (check:bare-sleep-wait)
- **Reason:** Growth-extract over captured sessions from 2026-09-06 (#1863): a `for i in 1..N; do
  sleep 20; done` loop blocked one session foreground for ~630s across four occurrences in one run,
  and the guard's own regex — anchored on `sleep` bounded by `;`/`&`/`|`/start/end — never fires
  on it, since the token before `sleep` there is `do `. A second `guardToolCalls` entry catches a
  `for` loop whose body is nothing but the sleep; a `while`/`until` loop stays clean, since that
  shape names a real condition.
- **Mechanism:** a check
- **Retire when:** Retire the entry only if `bare-sleep-wait`'s first regex is rewritten to subsume
  both shapes.
