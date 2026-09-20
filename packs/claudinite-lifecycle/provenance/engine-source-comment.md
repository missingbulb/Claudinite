## 2026-09-06 · born · converted from references.md (RULES-1)
- **Reason:** Read from `vendoring/compute-vendor-set.mjs` on 2026-09-06: the engine walk is a plain
  copy minus `*.md`, and the directory named by its `DOCS_DIR` constant is excluded as maintainer
  reference no mount runtime reads. So a source comment citing a design doc resolves in the canon
  and dangles in every member.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the vendor set starts shipping the design-doc tree.
