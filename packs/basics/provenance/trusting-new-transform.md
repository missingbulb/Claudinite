## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** the testing bullets of `engineeringPractices.md`.
- **Reason:** a hostname-apex helper passed its hand-picked tests and still mis-stripped
  `tel-aviv.gov.il` to `gov.il`; the gap surfaced only over the actual list of existing URLs.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, as a testing-discipline bullet.
- **Landed:** commit 5235b9d3.
