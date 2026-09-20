## 2026-09-08 · born · converted from references.md (RULES-80)
- **Reason:** #1888/#1889: `reference-integrity`'s migration exemption had never fired since it was
  written. It filtered for a top-level `migrations/<slug>/migration.mjs` (every record lives under
  the pack or engine that owns it) and read only the records the branch itself edits — and a
  branch deleting a vendored-out path is exactly the branch that leaves the record describing that
  vendoring alone. The exemption selected nothing on every run, so deleting four dead workflows
  raised 51 blocking findings of which 7 were real, and the sweep read as impossible across six
  triage runs.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if a work-scope exemption gains a way to name the tree it
  must read that a diff-scoped one cannot get wrong.
