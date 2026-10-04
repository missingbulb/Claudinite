---
name: running-the-suite
description: Running this repo's test suite: the one command that covers it, and reading a run's output from a file. Use before any node --test.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-tool-calls:
    - 'Bash.command /\bnode\s+--test\b/'
---

# Running the suite

- **The whole suite is one command** — `node --test $(git ls-files '*.test.mjs')`. There is no test
  script; `ci.yml`'s array is not authoritative. Every glob is a dangerous substitute, because
  `node --test` expands one itself and calls no match a clean green: `packs/*/test/*.test.mjs`
  without `globstar` reports nothing wrong over 134 of 345 files, and a pattern matching nothing
  exits 0 having run no test at all. Only `node --test <dir>`, and a literal path carrying no `*`,
  fail outright. (whole-suite-command)
- **Read a run's output from a file** — redirect one run and grep that file for the slice you need;
  never re-run the ~55s suite to re-slice unchanged output. (read-runs-output)
- **`git add` a new test file before certifying a run green** — `git ls-files` excludes an unstaged
  file, so the run never executed it; the `untracked-test-file` finding at Stop says which.
  (git-add-new)
- **Running the whole suite in a fresh checkout** - deepen it first when it is shallower than
  `origin/main~50`, since two test files refuse a clone that shallow and their failure looks like a
  regression until you open the message; a session's clone is not always that shallow, so test
  before fetching: (unshallow-before-suite)

  ```
  git rev-parse -q --verify origin/main~50 || git fetch --unshallow origin main
  ```
- **Iterating on a sweep across many files** — run only the test files the edit touches, plus
  `check_the_work`; spend the whole suite and `check_the_world` once, at the end. Both are
  whole-tree aggregates whose verdict cannot turn on one file. (iterating-sweep-across)
- **Editing a `RULES.md` or `README.md` under `packs/`** — the file that holds a pack's rule index
  in step with its prose sits outside the pack, and neither conformance sweep runs it, so add
  `node --test engine-tests/rule-index.test.mjs` to the files the edit touches. (editing-rules-md)
