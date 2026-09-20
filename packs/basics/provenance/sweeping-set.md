## 2026-09-15 · born · converted from references.md (writing-tests-7)
- **Reason:** Derived from xUnit Test Patterns' *Conditional Test Logic* smell and from
  `claudinite-canon-curation`'s standing rule that a check selecting inputs by path pattern must
  assert its scope is non-empty — the same failure on the test side, which no rule covered. Proven
  rather than argued: renaming the emitted `issue_write` call in `converge-item.mjs` left
  `converge-session.test.mjs`'s "names the repo it was given, on every call" green, and the same
  mutation against the pinned body fails on the count. Note the mechanism, which is why the rule
  says *how many* rather than *not empty*: the filter selected two call kinds and kept one, so the
  surviving `add_issue_comment` line satisfied the loop while the renamed call went unchecked. The
  audit found the same shape unpinned in `bootstrap.test.mjs`, `scenarios.test.mjs` and
  `rule-index.test.mjs`, and as an inner `if (script)` inside `task-schema.test.mjs`'s own pinned
  tree walk.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if a runner reports per-assertion execution counts, which would
  make an unexecuted assertion visible without a pin.
