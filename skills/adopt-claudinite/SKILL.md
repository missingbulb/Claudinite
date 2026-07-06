---
name: adopt-claudinite
description: Bootstrap Claudinite into a consuming repo — mount, hooks, checks, skills. Use when asked to bootstrap, adopt, or set up Claudinite, or to re-bootstrap a repo to pick up updates.
---

Follow [bootstrap.md](../../bootstrap.md) — canonical there, and idempotent by design: mount
the corpus (submodule or tarball sync), register the SessionStart/Stop/PreToolUse hooks, run
`--init` for the pack declaration, symlink the skills, open the maintenance-enrollment issue,
and categorize the project against the template catalog.
