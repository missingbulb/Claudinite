## 2026-09-15 · born · converted from references.md (writing-tests-12)
- **Reason:** Found by mutation: changing `time.getTime() <= nowMs` to `<` in `calendar.mjs`'s
  `anchorInstant` — three comparisons, covering the daily, weekly and monthly cadence — survived
  all 3,666 tests. The two mutants differ on exactly one input, the anchor instant itself, and no
  test stood there. It is not an exotic input here: the scheduler runs on an hourly cron, so a daily
  task anchored at 04:00 is evaluated at 04:00:00.000 on the ordinary path, and `<` would have made
  every such task wait a further day.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire if the suite gains a generator that samples boundaries automatically.
