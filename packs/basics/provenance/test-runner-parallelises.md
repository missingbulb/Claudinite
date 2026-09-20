## 2026-09-15 · born · converted from references.md (writing-tests-10)
- **Reason:** Measured on this canon (#2062): the suite ran 120.6s wall against 250s of user+sys on
  4 cores — 52% utilisation — because one file of 74 subprocess-bound cases took 76.5s by
  itself, above the 66s perfect 4-core parallelism would have given. `node --test` schedules whole
  files, so no `--test-concurrency` reaches inside one; running that file's cases concurrently took
  it to 22.1s and the suite to 58s.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if the runners in use schedule at test granularity across files
  rather than at file granularity.
