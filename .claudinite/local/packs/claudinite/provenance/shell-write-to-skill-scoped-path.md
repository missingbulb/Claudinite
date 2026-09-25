## 2026-09-14 · born · converted from references.md (check:shell-write-to-skill-scoped-path)
- **Reason:** `pretooluse-judge.mjs` holds an edit until its path-scoped skill is loaded, but only
  for `Edit`, `Write` and `NotebookEdit`; #1648 accepted the Stop-time backstop for shell writes,
  which the hook cannot see. Across 2026-09-13's captures, thirteen attended sessions made 1755 Bash
  calls and twelve of them made **no** file-tool call at all — every repo edit went through `cat
  >`, `python3 - <<PY` or `sed -i` — and ten collected a blocking `skill-loaded-before-editing`
  finding at Stop, each costing a load and a re-review of work already written. Advisory rather than
  blocking because a bulk sweep across many scoped files is a legitimate shell job the guard cannot
  tell apart.
- **Mechanism:** a check
- **Retire when:** Retire the check if the pre-edit guard learns to read Bash.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
