## 2026-09-05 · born · converted from references.md (sam-build-and-deps-1)
- **Reason:** Declaring esbuild in `dependencies` does not bloat the deployed artifact: it is not
  bundled unless the handler imports it, so the usual objection to the remedy — shipping a build
  tool to production — does not apply. Recovered from the rule's own pre-#467 text (cut by
  2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this pack
  had a references.md to hold it).
- **Mechanism:** prose, a guideline of the sam-build-and-deps skill
- **Retire when:** Reaffirm against SAM's esbuild builder; retire if it stops running a
  production-only install.
