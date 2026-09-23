## 2026-09-22 · born · a guard on the labels an issue is filed with
- **Source:** the owner found `claudinite-queue`, `conformance-backlog`, `plan-tracking`, `bug` and
  `needs-decision` on issues in this repo, each invented by the session that filed one and read by
  nothing.
- **Reason:** #2181 wears `claudinite-queue` instead of the mark, so no scheduler run will ever
  adopt it and its `Not-before` passes unnoticed; the failure is silent at filing time, which is
  where a guard can still speak.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** an action guard on `mcp__github__issue_write`'s `labels`, blocking: the PreToolUse
  hook denies the call before the label exists, and the vocabulary is a namespace test rather than a
  list, so a label the queue gains needs no edit here.
- **Retire when:** something other than the queue reads a label in this repo.
