## 2026-09-06 · born · converted from references.md (running-the-suite-4)
- **Reason:** Probed 2026-09-06 on node v22.22.2: `node --test <dir>` exits 1 with `Error: Cannot
  find module <dir>` — it treats the path as an entry module rather than silently under-running.
  The rule previously grouped it with the bash glob as an equally silent trap, which understates the
  glob: only the glob produces a green run over a subset. Re-probed 2026-09-20 on the same node: the
  directory error is unchanged, and node expands a glob argument itself, so the unmatched
  `*.test.mjs` the repo root now yields runs zero tests and exits 1 — which leaves a glob matching
  a subset (`packs/*/test/*.test.mjs`, 125 of 314 tracked files) as the only silent shape.
- **Mechanism:** prose, a guideline of the running-the-suite skill
- **Retire when:** Retire the distinction if `node --test <dir>` starts recursing, or starts failing
  quietly.
