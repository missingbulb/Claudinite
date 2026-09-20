## 2026-08-12 · born · split from `tokens-in-session-storage` (#775)
- **Source:** the second clause of the storage rule promoted in #222.
- **Reason:** re-run the silent flow; a refresh-token flow adopted just to survive restarts puts a longer-lived credential on disk.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose.
- **Retire when:** as `tokens-in-session-storage`.
- **Landed:** #775 · pack version 2.
