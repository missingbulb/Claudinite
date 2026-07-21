# Skills — the catalog

> Each skill is a harness-managed **trigger** (`skills/<name>/SKILL.md`) for an **activity-scoped**
> procedure — surfaced on demand when the work in front of you matches. Its content lives within the
> skill's **own directory** — the `SKILL.md` plus any companion files it needs (e.g.
> `unattended-agents/*.mjs`) — never redirecting into
> another tree. **Packs own the deployment:** each pack declares the
> skills it requires (`skills` in its `pack.mjs`), and a consumer mounts the union over its active
> packs as session-generated `.claude/skills/` symlinks ([engine/skills/mount-skills.mjs](../engine/skills/mount-skills.mjs),
> registered by bootstrap Part 7 — never committed). The `skill-ownership` check keeps every skill
> here required by at least one pack, both directions. Rules that are always-relevant to a project
> are pack prose, not skills; enforceable rules are checks. See
> [engine/checks/DESIGN.md](../engine/checks/DESIGN.md).

**Command skills** (owner phrase or bootstrap step):

| Skill | Trigger |
|---|---|
| `merge-to-main` | owner's "LGTM" (+ `/merge-to-main`) — the merge recipe (inlined); ends with the conversation capture ([the growth pack](../packs-tests/grow_with_claudinite/README.md) owns extraction) |
| `bump-version` | owner's "bump version" — delegates to the project's release pack/doc |
| `adopt-claudinite` | bootstrap request — runs [bootstrap.md](../bootstrap.md) |
| `generate-project-instructions` | fresh/empty project, or a facet no pack covers — extracts reusable `packs/<facet>/` seeds (class / technology / aspect / domain) + a thin project overlay |

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
| `prose-to-checks` | auditing the corpus for never-converted testable prose (the nightly growth sweep) |
| `writing-claudinite-skills` | authoring or changing a skill in the Claudinite corpus (canon home) |
| `single-branch-status` | assessing one branch's landed status (the tidy-repo repo-tidy task) |
| `single-pr-status` | assessing one PR's landed status (the tidy-repo repo-tidy task) |
| `single-issue-triage` | triaging one issue (the tidy-repo repo-tidy task) |
| `google-id-token-validation` | wiring server-side validation of Google Sign-In ID tokens — its checks carry the rules |
| `python-optional-deps` | wiring a Python package's optional heavy/native dependency — its checks carry the rules |
| `web-speech-io` | wiring browser speech recognition or synthesis — its checks carry the two signature-bearing rules, the runtime gotchas stay `web-speech` prose |

Technology guidance (Chrome extension, Node/jsdom, AWS SAM, HTML) is **not** a skill — it's the
prose of its `packs/<tech>/` pack, loaded eagerly whenever the project declares that pack.
