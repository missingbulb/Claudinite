## 2026-09-17 · born · converted from references.md (running-the-suite-5)
- **Reason:** 2026-09-16's capture on #2089 (session 2f6cc995, 20:37–20:47): the run edited six
  packs' prose, then cleared `check_the_world`, `check_the_work`, the edited pack's own suite and
  `engine-tests/pattern-rules.test.mjs` before pushing — none of which reads a README's rule index
  — and learned about the missing rows from CI four minutes later. Nothing in the path of
  `packs/<pack>/RULES.md` points at `engine-tests/`, so the covering test is the one an edit-touches
  heuristic cannot find.
- **Mechanism:** prose, a guideline of the running-the-suite skill
- **Retire when:** Retire the line if the rule index moves under the pack it indexes, or a
  conformance check takes it over from the test.
