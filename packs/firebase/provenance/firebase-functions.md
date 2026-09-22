## 2026-09-05 · born · the function-side limits become a path-forced skill (#1667)
- **Reason:** the limits, the fan-out semantics and the entrypoint smoke-load are needed when
  something under `functions/` is being written, which one path glob predicts. The bar it had to
  clear is the firestore-security-rules entry of the same date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill with `body: guidelines`, force-loaded for `functions/**`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
