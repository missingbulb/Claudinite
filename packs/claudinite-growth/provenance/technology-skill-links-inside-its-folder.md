## 2026-09-10 · born · converted from references.md (check:technology-skill-links-inside-its-folder)
- **Reason:** The basics rule against re-spelling how one file's dependency works already covers the
  ordinary case; the residue here is that a technology skill is promoted by *moving its folder*, so
  a link out of it dangles at the landing — the failure `references-integrity` catches for
  rationale markers and nothing catches for links.
- **Mechanism:** a check
- **Retire when:** Retire only if promotion rewrites relative links.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
