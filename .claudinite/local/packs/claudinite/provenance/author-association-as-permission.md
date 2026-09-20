## 2026-09-06 · born · converted from references.md (check:author-association-as-permission)
- **Reason:** #1067: `MEMBER` covers any org member regardless of repo permission and `COLLABORATOR`
  includes read-only collaborators, so both are broader than push access.
- **Mechanism:** a check
- **Retire when:** Retire the rule only if GitHub narrows what `author_association` means.
