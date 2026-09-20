## 2026-09-03 · born · converted from references.md (RULES-2)
- **Reason:** An audit of this repo's own tree (#1637) found ~28 legacy declaration sites across
  `engine/` and `packs/` — none of which told a holder to move, and several,
  `engine/version.mjs`'s integer tolerance among them, carrying a stated end date that had passed
  with nothing scheduled to act on it. A tolerance added without those two halves is
  indistinguishable from a permanent feature.
- **Mechanism:** prose
- **Retire when:** Reaffirm while tolerances can be added without a removal link; retire if a
  mechanism makes the omission impossible.

## 2026-09-03 · reworded · the removal gates on a stated window, never a census (RULES-2a)
- **Source:** #1637
- **Reason:** The rule first said the removal's gate must read back true rather than be a date, and
  the owner reversed it the same day: "the canon will never know the state of all active or inert
  repos that use it." A census gate is not the rigorous choice when the census cannot be taken; it
  is how a tolerance becomes permanent. The window's length is each change's own call (the owner set
  a week for the cleanup that prompted this), which is why the rule asks for a stated window and not
  a fixed one.
- **Actor:** owner
- **Retire when:** Reaffirm while consumers converge on their own schedule and cannot be enumerated.
