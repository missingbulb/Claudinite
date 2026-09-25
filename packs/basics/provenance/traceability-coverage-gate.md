## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** the testing bullets of `engineeringPractices.md`.
- **Reason:** a gate that accepts a claim from one fixed kind of test green-lights items that kind
  cannot observe: a UI-snapshot coverage gate parked behavioral items 9.1 to 9.3 and 3.4 and an
  unreachable 8.6 on cases that render none of them (#429).
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, as a testing-discipline bullet.
- **Landed:** commit 5235b9d3.
