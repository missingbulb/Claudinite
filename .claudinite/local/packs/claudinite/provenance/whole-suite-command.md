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

## 2026-09-06 · reworded · Rule revalidation: re-probe five harness claims at their live addresses (#1782)
- **Reason:** the skill's own text named the failing form wrongly for the same reason.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1782 (Refs #1767).

## 2026-09-20 · reworded · Claudinite growth: rule revalidation (#2161)
- **Source:** the weekly revalidation's re-probe of this pack's environment claims.
- **Reason:** the skill's own line named the root-level glob as the silent shape for the same
  reason.
- **Actor:** @missingbulb (owner).
- **Landed:** #2161 (Refs #2150).
