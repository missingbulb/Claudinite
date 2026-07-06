# The task lifecycle

The issue → branch → PR lifecycle every new task follows, independent of any one project. Its enforcement is the `task-lifecycle` conformance check (see [../checks/README.md](../checks/README.md)), which blocks a session from ending with branch commits that reference no issue — this doc keeps the method. The rest of the git/GitHub procedures (commit-in-layers, CI-trigger rules, merge gotchas) stay task-based in [git-and-github.md](../tasks/git-and-github.md).

For every new task:

1. Create a GitHub issue describing the task before starting work.
2. Develop on a branch; reference that issue number in commit messages (e.g. `Refs #123`, `Fixes #123`, or `Closes #123`).
3. Update the issue's status (comments / close) as work progresses and when it's done.
