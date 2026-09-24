## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** the testing bullets of `engineeringPractices.md`.
- **Reason:** the SPA-render fallback's CI test rendered a `data:` URL whose script filled an empty
  root rather than a live SPA (#310), the live target being bot-blocked from CI.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, as a testing-discipline bullet.
- **Landed:** commit 5235b9d3.
