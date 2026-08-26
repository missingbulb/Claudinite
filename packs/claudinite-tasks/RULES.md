# claudinite-tasks — working with the queue from inside a member

Working rules for a session operating one work item (`queue/instructions.md`) or otherwise
touching this mechanism from inside a consuming repo. What the mechanism does, and how it's wired
into a repo, are this pack's README and `executor.md`; this file is what falls out of using it.

- **A step that talks to GitHub's REST API directly** — `converge-item.mjs`, `gh.mjs`, a
  hand-rolled `curl`/raw-`fetch` CI-status poll — **cannot run from an ordinary agent session, and
  the failure is recognizable on sight.** Only Action-side code legitimately holds the real
  `GITHUB_TOKEN`; an in-session agent's GitHub access is MCP-tools-only. The signature is always
  the same: first `GITHUB_REPOSITORY is not set`, then — once that's worked around — a plain
  `401`, or under a proxied session a `403` ("GitHub access is not enabled for this session").
  Recognize the pattern immediately rather than re-deriving it from env vars and script internals
  each time, and **never hand-replicate the transition it would have performed** by calling
  `mcp__github__issue_write` with a `labels` field — that field **overwrites** the issue's whole
  label set rather than adding to it, so it silently clobbers the item's real queue-state labels
  (the exact failure `queue/instructions.md` itself warns about). The correct response is a plain
  comment naming the failure and leaving the item's labels and state untouched for a session that
  does carry the Action's credential.
