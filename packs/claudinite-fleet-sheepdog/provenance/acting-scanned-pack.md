## 2026-08-17 · born · a scanned finding is a recommendation, never a verdict (#958)
- **Reason:** whether to declare a pack is the project's call. The `pack-declaration` conformance
  check was deliberately retired for that reason, and a scan must not reintroduce it one rung
  further out.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Acting on a scanned pack suggestion".
- **Landed:** #958 (Closes #954).
