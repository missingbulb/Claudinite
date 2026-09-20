## 2026-09-15 · born · converted from references.md (writing-tests-8)
- **Reason:** *Software Engineering at Google* ch. 12, "Test via Public APIs": a test that reaches
  past the interface "is brittle, and almost any refactoring of the system under test (such as
  renaming its methods, factoring them out into a helper class…) would cause the test to break,
  even if such a change would be invisible to the class's real users." One holder in this corpus:
  `update-worker.test.mjs` greps `tasks/update/worker.mjs` — a module it also imports — for
  `settingsPath(root)`, `deliveryFor(declaration)` and the byte order of two lines (`target <
  disposal`). Those greps exist because the worker's only real entry point is `main()`, which drives
  git and the network; the rule's second clause is what that file should say instead.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire if the corpus stops shipping modules whose whole behaviour sits behind one
  side-effecting entry point.
