## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter, whose optional backends are each imported behind a
  `try/except ImportError` naming the `pip install` extra.
- **Reason:** a guard that re-raises without naming the extra leaves the user with a bare
  `ModuleNotFoundError` from deep inside a backend instead of the command that fixes it.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** an advisory check of the skill, on the repo state rather than the work, since an
  unhelpful guard is a live defect however long ago it merged. Advisory because whether a message
  names the *exact* extra is a wording judgment. A block is in scope only where its own try-body
  imports a declared-optional package, so an unrelated `except ImportError` is never touched.
- **Rejected:** flagging the other half of the guard rule. A probe guard that sets a flag instead of
  re-raising cannot be told from an accidental unused import without a full unused-name analysis, so
  it has no `raise` to match and stays prose.
- **Landed:** #345 (Refs #303) · pack version 1.

## 2026-09-04 · reworded · the doc: pointer names the path the tree carries (#1676)
- **Reason:** it still named the pre-#385 `skills/<name>/` layout, one of seven such pointers the
  new `doc-pointers-resolve` check found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 (Closes #1675) · pack version 60904.1.
