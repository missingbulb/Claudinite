# Skills — the catalog

> **Status: delivered — all catalog skills exist as thin wrappers.** Each skill is a
> harness-managed *trigger* (`skills/<name>/SKILL.md`, symlinked into a consumer's
> `.claude/skills/` by bootstrap Part 7); the content stays canonical in the corpus doc the
> skill points at, so consumers without symlinks lose nothing — the index soft pointers still
> route. Rationale, delivery mechanics, and the probabilistic-trigger caveat live in
> [checks/DESIGN.md](../checks/DESIGN.md).

| Skill | Trigger | Replaces |
|---|---|---|
| `merge-to-main` | owner's "LGTM" (+ `/merge-to-main`) | [always/merge-to-main.md](../always/merge-to-main.md) — force-loaded today; ends with the lessons pass |
| `lessons-learned` | owner's "learned lessons"; invoked by `merge-to-main` | [growth/extracting-lessons.md](../growth/extracting-lessons.md) — force-loaded today |
| `bump-version` | owner's "bump version" | preference entry; delegates to the project's release doc |
| `adopt-claudinite` | bootstrap request | [bootstrap.md](../bootstrap.md) as an executable procedure |
| `bug-investigation` | description-matched: investigating a bug, a fix that didn't hold | [tasks/bug-investigations.md](../tasks/bug-investigations.md) |
| `writing-tests` | description-matched: writing/changing tests | the stays-residue of [tasks/testingPractices.md](../tasks/testingPractices.md) |
| `repo-text-sweeps` | description-matched: grep/sed sweep, rename, relocation | the procedure-residue of [tasks/textAndFileManipulation.md](../tasks/textAndFileManipulation.md) |
| `authoring-agent-docs` | description-matched: writing a Claude instruction doc | [tasks/agentic-documentation.md](../tasks/agentic-documentation.md) |
| `unattended-agents` | description-matched: building agents/routines | [tasks/agent-architecture.md](../tasks/agent-architecture.md) + [tasks/agenticBestPractices.md](../tasks/agenticBestPractices.md) residue |
| `git-github-advanced` | description-matched: beyond-baseline git/GitHub work | the knowledge-residue of [tasks/git-and-github.md](../tasks/git-and-github.md) |
| `chrome-extension` | `paths`-scoped to manifest/extension globs + description | the signature-less residue of [technologies/chrome-extension.md](../technologies/chrome-extension.md) (+ pointer to the release standard, whose *enforcement* is the conformance pack) |
| `nodejs-testing` | `paths`-scoped to test globs + description | [technologies/nodejs.md](../technologies/nodejs.md) |
| `aws-sam` | `paths`-scoped to `template.yaml` + description | the diagnostic residue of [technologies/aws-sam.md](../technologies/aws-sam.md) |
| `html` | description-matched | [technologies/html.md](../technologies/html.md) |

Add a row when a skill is added; a skill whose source doc gains a tech-pack check keeps only
the signature-less residue (see the per-gotcha split in
[checks/conversion-inventory.md](../checks/conversion-inventory.md)).
