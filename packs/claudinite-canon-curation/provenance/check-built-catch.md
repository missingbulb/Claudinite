## 2026-09-04 · born · converted from references.md (RULES-8)
- **Reason:** #1060: gating release checks on the orchestrator workflow's name alone means a repo
  that renamed it loses every release check including the one that tells it to rename it back —
  and gating on the config alone leaves `cer/release-config`, whose whole job is a missing config,
  unreachable. Two signals, either sufficient, is what survives.
- **Mechanism:** prose
