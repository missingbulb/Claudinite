## 2026-09-14 · born · converted from references.md (ci-performance-evaluation-1)
- **Reason:** #2012's run ledger: the canon's CI spends 11 s of 150 s in checkout and setup-node
  against 131 s of tests, so profiling was right there — but the skill had no branch for the other
  shape, a run whose install dwarfs its suite, and would have sent it through eight steps that only
  measure tests.
- **Mechanism:** a step of the ci-performance-evaluation skill, a workflow
- **Retire when:** Retire if the step-1 breakdown grows a mechanised classifier that routes the two
  shapes itself.
