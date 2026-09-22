## 2026-09-01 · born · converted from references.md (check:markdown-link-labels)
- **Reason:** Converted from `repo-text-sweeps`' prose in #552. The mechanism a review needs is the
  sweep that produces it: a Markdown link carries its path **twice** —
  ``[`old/path.md`](../old/path.md)`` holds it in both the visible label and the target — so a
  `sed` anchored on the `](../href)` form rewrites the target and leaves the label reading the old
  path, and the doc then points right while *reading* wrong. Both the plain `[old/path.md]` and
  backticked label forms need the same rewrite.
- **Mechanism:** a check
- **Retire when:** Reaffirm while Markdown duplicates the path across label and target; retire only
  if that stops being true.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
