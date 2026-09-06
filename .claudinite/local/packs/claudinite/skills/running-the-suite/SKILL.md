---
name: running-the-suite
description: Running this repo's test suite — the one command that covers it, reading a run's output from a file instead of re-running it, iterating on the tests an edit touches, and staging a new test file before certifying a run. Use before any node --test.
metadata:
  force-load-on-tool-calls:
    - 'Bash.command /\bnode\s+--test\b/'
---

# Running the suite

- **The whole suite is one command** — `node --test $(git ls-files '*.test.mjs')`. There is no test
  script; `ci.yml`'s array is not authoritative. A bash glob without `globstar` is the dangerous
  substitute — it reached 37 of 65 files and reported nothing wrong — while `node --test <dir>`
  fails outright, so only the glob leaves you believing a green run. (4)
- **Read a run's output from a file** — redirect one run and grep that file for the slice you need;
  never re-run the ~55s suite to re-slice unchanged output. (1)
- **`git add` a new test file before certifying a run green** — `git ls-files` excludes an unstaged
  file, so the run never executed it; the `untracked-test-file` finding at Stop says which. (2)
- **Iterating on a sweep across many files** — run only the test files the edit touches, plus
  `check_the_work`; spend the whole suite and `check_the_world` once, at the end. Both are
  whole-tree aggregates whose verdict cannot turn on one file. (3)
