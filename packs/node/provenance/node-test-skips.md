## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** #740's growth-promote batch, rebuilt rather than patched: its own dedupe had left
  several lessons standing twice and its base was 40 commits behind `main`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule opening a new "Test discovery" section.
- **Landed:** #751 (Refs #740) · pack version 1.

## 2026-08-16 · strengthened · naming a path is not enough, it must resolve to files that exist (#853)
- **Source:** ClaudiniteWebsite's own `node-test-discovery` check, read in the growth-promote run of
  2026-08-15.
- **Reason:** a typo'd glob, a moved fixture or a renamed directory produces the identical zero-test
  green, so the property to assert is that every path a `node --test` invocation names still matches
  something in the tree.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Rejected:** converting the sharpened property to a check in the same change. The lesson was
  already canon prose, and canon prose to canon check is the standing prose-to-checks sweep's
  territory, which reads this file and will see the new property; flagged in the tracker instead.
- **Landed:** #853 (Refs #852) · pack version 2.

## 2026-09-05 · moved · out of RULES.md into the node-test-discovery skill (#1667)
- **Source:** the rules-to-skills audit #1662, applied under the bar the owner set mid-review: a
  rule leaves `RULES.md` for a skill only where that skill's `force-load-on-file-edits-paths` covers
  every moment the rule is needed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `node-test-discovery` skill, which owns why it loads on those
  paths; see that element's file.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
