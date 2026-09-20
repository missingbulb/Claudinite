## 2026-09-01 · born · converted from references.md (RULES-62)
- **Reason:** Three misses in one window, one of each shape: `CLAUDINITE_TASKS_SUSPEND_ALL`
  documented as live and never built, beside `exclusive` which had retired with its mechanism
  (#975); `session_scope`, a writer with no reader left and nothing saying so (#993); and the usage
  fold's `tasks` census, a reader whose parser outlived the log lines it read (#994).
- **Mechanism:** prose
