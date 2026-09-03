---
name: mark-a-verification-gap
description: How a leaf the harness cannot yet faithfully verify is marked in the spec and listed in the committed gap allowlist the coverage gate checks. Use when a requirement can't be proven yet, or when shrinking the allowlist.
---

# Marking a verification gap

- **Deliberate gaps are marked at the leaf and committed, never remembered.** A leaf that can't be
  faithfully verified yet stays in the spec, visibly provisional (a loud "to be decided" marker, and a
  pointer to whatever covers it meanwhile), and is listed in a committed allowlist the coverage gate
  checks — the allowlist is the burn-down list, shrunk deliberately. Prefer a real validation; reach
  for the marker only for a genuinely undecided edge case or a not-yet-wired harness.
