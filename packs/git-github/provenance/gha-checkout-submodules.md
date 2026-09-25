## 2026-09-01 · born · converted from references.md (check:gha/checkout-submodules)
- **Reason:** The behaviour: `actions/checkout` does **not** fetch submodules by default, so the
  submodule directory is an empty folder in CI. The failure class is what earns a blocking check —
  a gate reading submodule content does not fail, it **passes vacuously**: the check becomes a no-op
  rather than a signal, which is invisible in a green run. Converted from `git-github-advanced`'s
  prose in #552, which deletes a paragraph whole once a check covers it — the failure message owns
  the rule and the check's own text owns the remedy, so what is recorded here is the platform
  behaviour the check encodes and the condition that would retire it.
- **Mechanism:** a check
- **Retire when:** Reaffirm against `actions/checkout`'s documented defaults; retire only if it
  starts fetching submodules by default.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
