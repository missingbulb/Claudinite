## 2026-09-10 · born · converted from references.md (check:technology-skill-links-inside-its-folder)
- **Reason:** The basics rule against re-spelling how one file's dependency works already covers the
  ordinary case; the residue here is that a technology skill is promoted by *moving its folder*, so
  a link out of it dangles at the landing — the failure `references-integrity` catches for
  rationale markers and nothing catches for links.
- **Mechanism:** a check
- **Retire when:** Retire only if promotion rewrites relative links.
