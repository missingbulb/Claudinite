---
name: node-test-discovery
description: Wiring a `node --test` invocation so it actually finds the suite. Loaded for any edit of a workflow or package.json test script.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - ".github/workflows/**"
    - "package.json"
    - "*/package.json"
---

# Node test discovery

- **`node --test` skips dot-directories, so a bare invocation over a suite living under one runs
  zero tests and exits green — and naming that directory as a bare argument is not the fix
  either.** Node's default discovery walks the tree but ignores hidden directories outright, and
  finding nothing is *success* — a run reporting no failures because it found no tests reads
  exactly like a passing suite. But `node --test <directory>` does not recurse into it: Node
  treats the directory itself as a module to load and fails with one misleading `MODULE_NOT_FOUND`
  "test" instead — a false *failure* that reads as a real regression, the opposite mistake from
  the silent-green case and just as easy to walk into (verified live, Node v22.22.2). The only
  argument that actually reaches the suite is an explicit **glob**
  (`<dir>/**/*.test.mjs`). Confirm the step by watching the **test count be non-zero**, not merely
  by its colour — green can mean nothing ran, and the misleading red can mean the suite never
  loaded. Naming a path is not enough either way — the glob must **resolve to files that exist**:
  a typo'd glob, a moved fixture or a renamed directory produces the identical zero-test green, so
  the property to assert is that every path a `node --test` invocation names still matches
  something in the tree. (node-test-skips)
