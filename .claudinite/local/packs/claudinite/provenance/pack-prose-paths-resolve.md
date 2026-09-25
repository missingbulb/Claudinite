## 2026-09-22 · born · a moved module left a rule pointing at nothing (#2230)
- **Source:** the #2214 planning session, where a subagent opened its report correcting the premise:
  `packs/claudinite-tasks/deliver-generated.mjs`, cited by this pack's `writing-task-output`, had
  moved to `public/delivery.mjs`.
- **Reason:** `reference-integrity` is work-scoped and flags only a path the branch in front of it
  deletes, so a citation stranded by an earlier move survives every later run; the sweep over the
  tree found four such citations across the shelf and this pack.
- **Mechanism:** a world-scoped declared check. `extractValueSets` reads the backticked
  `packs/`/`engine/` citations out of every pack's `RULES.md` and `skills/*/SKILL.md`,
  `checkSetValues` requires each to exist. Only those two trees, because a canon pack's prose also
  names paths in the repo adopting it; only session prose, because a provenance entry names the path
  a move retired and a README is not where a session is sent.
- **Rejected:** widening `reference-integrity`; its two assertions read the change, and a
  stranded citation is a property of the tree.
- **Retire when:** the citations are generated from the tree rather than written by hand.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2230.
- **Model:** claude-opus-5

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
