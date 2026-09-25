## 2026-09-25 · born · the flat task and dashboard files are only worth reading while current (#2322)
- **Reason:** the dashboard and sessions read `.claudinite/flat/` instead of every pack's task.json
  and dashboard.json, so a stale copy misreports what runs here.
- **Actor:** @missingbulb (owner) asked for the flattening.
- **Mechanism:** a coded world check, blocking like its siblings `rules-index-current` and
  `skills-index-current`. It is inert until the engine writes the flat directory.
- **Landed:** #2322
