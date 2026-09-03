---
name: filing-sub-issues
description: Attaching an issue that belongs under another — a phase of a plan, a verification of a change, a follow-up its parent tracks — as a GitHub sub-issue rather than a number in the body. Use when filing an issue whose parent should show what is still open under it.
---

# Filing sub-issues

- **Filing an issue that belongs under another** — a phase of a plan, a verification of a
  change, a follow-up its parent tracks — attach it as a **sub-issue**
  (`mcp__github__sub_issue_write`, method `add`, `sub_issue_id` the **id** the create call
  returned, not its number), never only a number named in the body. The parent then carries
  what is still open under it, in the place a reader is already looking.
