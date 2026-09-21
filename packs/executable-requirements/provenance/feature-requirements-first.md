## 2026-07-17 · born · Interactive-comment routing: three-mode prose + conversation-surface checks (#311)
- **Source:** the owner's ask, alongside the new three-mode routing for interactive comments, for
  assurances that the flow a comment's class demands was actually followed.
- **Reason:** classifying the comment stays judgment; that a feature run put the spec first is a
  fact about the branch, so it is enforced rather than trusted.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a check-the-work rule on the conversation surface, running at the Stop hook where
  the transcript is available and self-gating to nothing in CI where it is not, scoped by the owner
  comment's timestamp so earlier branch work is never re-litigated.
- **Landed:** #311 (Fixes #310, Closes #314) · pack version 1.

## 2026-07-18 · severity-changed · the spec path resolves from config, and the rule self-skips when it is absent (#338)
- **Source:** landing a feature in CrosswordChat, whose spec is at `dev/docs/REQUIREMENTS.md`.
- **Reason:** a check-the-work rule must always be satisfiable by doing the work right, or not fire
  at all. Hardcoding the canonical spec path gave a project whose spec lives elsewhere a finding no
  commit could clear.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the gate widens - the spec path resolves from `config.spec` on the pack entry,
  defaulting to the canonical one, and the rule self-skips when the resolved spec is absent from the
  repo.
- **Rejected:** the two escapes the old shape left - an `accept`, which is a check-the-world
  instrument a successive run would not even re-find, and a post-hoc rebase.
- **Landed:** #338 (Refs #337) · pack version 1.
