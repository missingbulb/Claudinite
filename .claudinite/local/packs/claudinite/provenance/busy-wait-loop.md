## 2026-09-11 · born · converted from references.md (check:busy-wait-loop)
- **Reason:** Session 4baa0098, 2026-09-11 16:12–16:15Z: after the #1933 merge the session
  backgrounded `capture-log.mjs`, then waited on its output file with `until [ -s <file> ]; do :;
  done`. The file was never written, the empty body never yielded, and the loop ran 2m28s until the
  owner killed the task — asking "What is holding you?" twice before the session could answer at
  all. The retry that worked ran the command in the foreground into a file. `bare-sleep-wait`
  catches the opposite spelling (a wait with no condition) and would not have fired here.
- **Mechanism:** a check
- **Retire when:** Retire the check if the harness starts pre-empting a wedged Bash call.
