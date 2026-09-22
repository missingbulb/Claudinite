## 2026-09-10 · born · Design a licensed, installed Claudinite, and banner unbuilt design docs (#1815)
- **Reason:** a design doc describing a system nobody built reads as a description of the
  repository; the banner is what tells a later session not to read the framing off it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check design-doc-status-banner, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1815 (Closes #1814).
