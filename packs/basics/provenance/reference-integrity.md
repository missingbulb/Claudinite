## 2026-09-01 · born · converted from references.md (check:reference-integrity)
- **Reason:** Converted from `repo-text-sweeps`' prose in #552. The evidence for a blocking check is
  that nothing else catches it: a removed doc, module, or renamed path leaves dangling links,
  imports and index entries behind that **no test necessarily fails on** — a README docs-index
  link to a deleted file stays green. The prose also fixed the timing the check cannot enforce: grep
  the tree for the old path in the same change as the removal, not later.
- **Mechanism:** a check
- **Retire when:** Reaffirm while dangling references stay invisible to the suite; retire only if
  the test suite starts failing on them.
