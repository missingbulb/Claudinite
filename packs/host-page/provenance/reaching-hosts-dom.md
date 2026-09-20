## 2026-09-05 · born · converted from references.md (RULES-1)
- **Reason:** The quarantine is what makes the rest of a host-adapting codebase testable without a
  browser at all: with the host's vocabulary confined to one module, the layers above it are pure
  functions over a snapshot type. Seeded from CrosswordChat's `page-adapter/`, where the arch test's
  token ban on the host's class prefix outside that directory is what kept the boundary honest over
  a year of host redesigns.
- **Mechanism:** prose
- **Retire when:** Reaffirm while host markup remains unversioned and unannounced; retire if hosts
  start publishing stable automation contracts.
