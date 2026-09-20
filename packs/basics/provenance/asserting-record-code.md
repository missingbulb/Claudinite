## 2026-09-15 · born · converted from references.md (writing-tests-4)
- **Reason:** An audit of the canon's ~3,600 tests found ~30 assertions reading back a value the
  test's own setup had chosen: a declared check's `severity` (a pass-through of the declaration) and
  its `rule` id (the very id the test selected the check by).
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if findings stop carrying fields the engine copies through
  unchanged.
