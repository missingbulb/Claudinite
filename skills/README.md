# Skills — the catalog

> Each skill is a harness-managed **trigger** (`skills/<name>/SKILL.md`, symlinked into a
> consumer's `.claude/skills/` by bootstrap Part 7) for an **activity-scoped** procedure —
> surfaced on demand when the work in front of you matches. Its content lives in the SKILL.md
> itself (no cross-tree redirect). Rules that are always-relevant to a project are pack prose,
> not skills; enforceable rules are checks. See [checks/DESIGN.md](../checks/DESIGN.md).

**Command skills** (owner phrase or bootstrap step):

| Skill | Trigger |
|---|---|
| `merge-to-main` | owner's "LGTM" (+ `/merge-to-main`) — the merge recipe (inlined); ends with the lessons pass |
| `lessons-learned` | owner's "learned lessons"; invoked by `merge-to-main` ([growth/extracting-lessons.md](../growth/extracting-lessons.md)) |
| `bump-version` | owner's "bump version" — delegates to the project's release pack/doc |
| `adopt-claudinite` | bootstrap request — runs [bootstrap.md](../bootstrap.md) |
| `generate-project-instructions` | fresh/empty project with no class pack — works out its category and writes its working-instructions doc |

**Practice skills** (description-matched to the activity in front of you — full content inlined):

| Skill | Use when |
|---|---|
| `engineering-practices` | writing or editing code |
| `file-placement` | placing, moving, or renaming a file |
| `bug-investigation` | investigating a bug, or a fix that didn't hold |
| `writing-tests` | writing or changing a test |
| `repo-text-sweeps` | a grep/sed sweep, a rename, a path relocation |
| `authoring-agent-docs` | writing a Claude instruction doc |
| `unattended-agents` | building or running an unattended agent / recurring routine |
| `git-github-advanced` | git/GitHub work beyond the baseline lifecycle |

Technology guidance (Chrome extension, Node/jsdom, AWS SAM, HTML) is **not** a skill — it's the
prose of its `packs/<tech>/` pack, loaded eagerly whenever the project declares that pack.
