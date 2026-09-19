---
status: live
---

## 2026-08-12 · born · split from `tokens-in-session-storage` (#775)
- **Source:** the second clause of the storage rule promoted in #222.
- **Reason:** re-run the silent flow; a refresh-token flow adopted just to survive restarts puts a longer-lived credential on disk.
- **Actor:** owner.
- **Model:** unrecovered.
- **Mechanism:** prose.
- **Rejected:** none recorded.
- **Retire when:** as `tokens-in-session-storage`.
- **Evidence:** #775; #222 (Refs #99).
