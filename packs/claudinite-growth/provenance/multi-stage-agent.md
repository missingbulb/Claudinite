## 2026-07-03 · born · Salvage the still-unlanded rules from the stale pull request #72 (#103)
- **Source:** issue #71's curation, salvaged from the stale pull request #72.
- **Reason:** a pipeline whose failure exits diverge leaves an item reading as unprocessed rather
  than blocked, so the escalation path is silently defeated.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "In a multi-stage agent
  pipeline, every failure exit must converge to the same human-triage state.".
- **Landed:** #103 (Closes #71, Closes #96).
