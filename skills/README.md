# Skills — the catalog

> Each skill is a harness-managed **trigger** (`skills/<name>/SKILL.md`, symlinked into a
> consumer's `.claude/skills/` by bootstrap Part 7) for an **activity-scoped** procedure —
> surfaced on demand when the work in front of you matches. (Rules that are always-relevant to a
> project are pack prose, not skills; enforceable rules are checks. See
> [checks/DESIGN.md](../checks/DESIGN.md).)

| Skill | Trigger | Carries |
|---|---|---|
| `merge-to-main` | owner's "LGTM" (+ `/merge-to-main`) | the merge recipe ([always/merge-to-main.md](../always/merge-to-main.md)); ends with the lessons pass |
| `lessons-learned` | owner's "learned lessons"; invoked by `merge-to-main` | the retrospective method ([growth/extracting-lessons.md](../growth/extracting-lessons.md)) |
| `bump-version` | owner's "bump version" | version-raise; delegates to the project's release pack/doc |
| `adopt-claudinite` | bootstrap request | [bootstrap.md](../bootstrap.md) as an executable procedure |
| `generate-project-instructions` | fresh/empty project with no class pack | works out the project's category and writes its working-instructions doc |
| `bug-investigation` | investigating a bug, a fix that didn't hold | [tasks/bug-investigations.md](../tasks/bug-investigations.md) |
| `writing-tests` | writing/changing tests | [tasks/testingPractices.md](../tasks/testingPractices.md) |
| `repo-text-sweeps` | grep/sed sweep, rename, relocation | [tasks/textAndFileManipulation.md](../tasks/textAndFileManipulation.md) |
| `authoring-agent-docs` | writing a Claude instruction doc | [tasks/agentic-documentation.md](../tasks/agentic-documentation.md) |
| `unattended-agents` | building agents/routines | [tasks/agent-architecture.md](../tasks/agent-architecture.md) + [tasks/agenticBestPractices.md](../tasks/agenticBestPractices.md) |
| `git-github-advanced` | git/GitHub work beyond the baseline lifecycle | [tasks/git-and-github.md](../tasks/git-and-github.md) |

Technology guidance (Chrome extension, Node/jsdom, AWS SAM, HTML) is **not** a skill — it's the
prose of its `packs/<tech>/` pack, loaded eagerly whenever the project declares that pack. The
`tasks/` docs above still hold each practice skill's canonical content; inlining them into their
SKILL.md is the next step (Layer 3).
