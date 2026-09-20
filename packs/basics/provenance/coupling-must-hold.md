## 2026-09-15 · born · converted from references.md (writing-tests-5)
- **Reason:** Four fleet-sheepdog task suites each asserted that their own `task.json` named its
  directory and a worker beside it. The canon had ~30 tasks, so the shape was held for the four that
  happened to have a suite and unguarded for the rest; folding it into `task-schema.test.mjs`'s
  existing tree walk covered all of them and deleted four copies.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if per-member suites become mandatory for every member of such a
  set.
