# The task lifecycle

The issue → branch → PR lifecycle every new task follows, independent of any one project. It is **always-on**: the root [CLAUDE.md](../CLAUDE.md) `@`-imports it from the always-on baseline so it loads every session, rather than soft-pointing to it — because it applies to every task, not a specific kind of work. The rest of the git/GitHub procedures (commit-in-layers, CI-trigger rules, merge gotchas) stay task-based in [git-and-github.md](../tasks/git-and-github.md).

For every new task:

1. Create a GitHub issue describing the task before starting work.
2. Develop on a branch; reference that issue number in commit messages (e.g. `Refs #123`, `Fixes #123`, or `Closes #123`).
3. Update the issue's status (comments / close) as work progresses and when it's done.
