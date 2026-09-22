## 2026-07-04 · born · Project-type templates catalog + categorize-at-bootstrap flow (#116)
- **Source:** the gRatio project's `docs/research_process_playbook.md`, lifted verbatim as the first
  entry in a project-type templates catalog and scrubbed of the one project-specific path it
  hardcoded.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a rule of the playbook template `templates/research-project.md`, triggered on "The
  owner's annotations are the ground truth.".
- **Landed:** #116 (Closes #115).

## 2026-09-06 · strengthened · never validate against the pipeline's own prior output (#1671)
- **Reason:** the rule barred validating against the reader's own expectation of the answer but not
  against the pipeline's previous output, which agrees with whatever the pipeline already did and so
  validates nothing. Kept as prose: in-flight judgment with no signature the check vocabulary can
  carry.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.1.
