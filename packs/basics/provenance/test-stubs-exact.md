## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** the testing bullets of `engineeringPractices.md`.
- **Reason:** a stub at the exact boundary where the bug lives guards the shape asserted, never the
  runtime effect, so the test cannot catch the bug it was written for.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, as a testing-discipline bullet.
- **Landed:** commit 5235b9d3.
