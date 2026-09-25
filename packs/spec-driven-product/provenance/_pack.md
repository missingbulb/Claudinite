## 2026-07-07 · born · Rewrite generate-project-instructions around facet extraction; seed spec-driven-product (#162)
- **Source:** the class's two worked examples in the owner's fleet -
  missingbulb/GoogleCalendarEventCreator's executable-requirements methodology, the origin, and
  missingbulb/TLDR's adaptation of it, which adds the cross-tier server kind.
- **Reason:** the class was named by running the facet-extraction procedure against the two
  exemplars and keeping only what survived the portability strip - no repo path, command or product
  noun. Enforcement of the class belongs inside the declaring project, since the coverage gate and
  the allowlist the playbook requires are that project's own suite, so the pack carries no checks
  and its sections stay prose: loop and judgment.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest. Prose only and declared rather than fingerprinted - a
  working-style class has no structural constant a repo could be detected by.
- **Rejected:** the exemplar's extractor-automation pipeline (unattended-agents' territory), its
  folder-is-the-kind harness mechanics and re-baseline popup mechanics (project-level), and
  shared-constants drift guards (a corpus check already owns them). Rules the corpus already owned
  were pointed at rather than restated.
- **Landed:** #162 (Closes #161) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph describing the class and framing the playbook as a
  default to adapt rather than a contract. It changes nothing a session does while every session in
  every declaring repo pays for it, and the README and the manifest's routing guidance already carry
  it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.
