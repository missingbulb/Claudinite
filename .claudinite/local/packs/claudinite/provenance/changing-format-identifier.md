## 2026-09-17 · born · converted from references.md (RULES-93)
- **Reason:** #2100: `cloudflare-site`'s release minor was a bare `MMDD`, which runs backwards every
  New Year — `1231` then `0101` — so "later means bigger" stopped being true once a year.
  Counting years from a fixed epoch took the minor to at least five digits where the old one was at
  most four, so every adopter's next release sorts above its last whatever date it lands on, and the
  fix shipped with no renumbering, no cutover and no tolerance to retire. The canon cannot census
  its members (RULES-12), so a format change that orders itself is the only one that converges
  without a window.
- **Mechanism:** prose
- **Retire when:** Retire the rule if members gain a lockstep migration path.
