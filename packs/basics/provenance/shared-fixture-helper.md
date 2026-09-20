## 2026-09-15 · born · converted from references.md (writing-tests-9)
- **Reason:** Measured on this canon (#2062): a check fixture's `git init` + seed commit + branch is
  four subprocesses at ~27ms, against ~3ms to copy the finished tree, and the suite built it over a
  thousand times — ~1000 tests sat in a band at ~53ms each before any rule ran. The band, not a
  few slow outliers, was where the time was.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if process-level setup stops being the dominant per-test cost —
  a runner that shares one warm process across files, or fixtures that stop shelling out, would do
  it.
