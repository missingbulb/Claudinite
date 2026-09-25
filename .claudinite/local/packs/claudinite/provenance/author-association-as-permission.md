## 2026-08-20 · born · Claudinite growth: extract lessons (#1083)
- **Source:** the growth-extract run over the window in #1035.
- **Reason:** #1067: `MEMBER` covers any org member regardless of repo permission and `COLLABORATOR`
  includes read-only collaborators, so both are broader than push access.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Retire when:** GitHub narrows what `author_association` means.
- **Landed:** #1083 (Refs #1035).

## 2026-09-06 · converted · Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779)
- **Reason:** the four-moment mechanisms #1711 landed gave the rule a moment that could carry it, so
  the prose was retired by the deletion test rather than kept beside the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check author-association-as-permission, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1779 (Closes #1760).
