## 2026-09-01 · born · converted from references.md (check:home-seeded-packs-declared)
- **Reason:** Baselining lands a seeded pack on every member but is gated `!isHome`, so the canon's
  own declaration is hand-maintained and a newly `seededByDefault` pack would reach the whole fleet
  except this repo, invisibly.
- **Mechanism:** a check
- **Retire when:** Retire the check only if baselining stops skipping the home.
