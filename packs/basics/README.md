# basics pack

The baseline pack — the `RULES.md` prose every session loads (injected by the pack-prose hook) plus the working-discipline checks. Its subject is **how work is done**, whatever tool is running it. Declared explicitly like every other pack — no pack is active by default; bootstrap seeds the declaration and the nightly baselining backfills it into existing consumers.

## Rules (`RULES.md`)

The always-on rules — the ones a session must hold before it decides which file to open.

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Starting any requested change | high | correctness | prose: 59 words |
| Replying to an owner comment | high | complexity | prose: 109 words |
| Acting on a correction | high | correctness | prose: 39 words |
| Acting on a feature | high | correctness | prose: 39 words |
| Acting on a process change | medium | complexity | prose: 45 words + skill (`mechanism-promotion-ladder`) |
| Building a mechanism for a behavior | medium | complexity | prose: 18 words |
| Building release, deploy, versioning or CI plumbing | medium | complexity | prose: 46 words |
| Finishing a change | high | correctness | prose: 33 words |
| Changing scheduled or unattended machinery | high | correctness | prose: 36 words |
| Planning a migration | medium | complexity | prose: 50 words + skill (`writing-migration-plans`) |
| Adding a legacy tolerance | high | complexity | prose: 59 words |
| When verifying now is genuinely impossible | high | correctness | prose: 60 words + skill (`verify-in-production`) |
| Finishing a larger element | medium | correctness | prose: 58 words + skill (`production-retrospective`) |
| Receiving feedback that flags a misunderstanding | medium | complexity | prose: 29 words |
| Writing anything | low | complexity | prose: 18 words |
| Auditing an artifact against its source | high | correctness | prose: 35 words |
| Acting on an approval | high | correctness | prose: 69 words |
| Searching for a tool with ToolSearch | medium | complexity | prose: 57 words |
| Calling Edit | low | complexity | prose: 39 words |
| Calling Grep with a context flag | medium | complexity | prose: 51 words |
| Needing exact text from the web | high | correctness | prose: 56 words |
| Hitting a denied fetch | critical | legal | prose: 88 words |
| Scheduling a wake-up with the harness | high | correctness | prose: 60 words |
| Seeing a build, test or CI warning | medium | correctness | prose: 28 words |
| Suppressing a warning | medium | complexity | prose: 74 words + check (`warning-suppression`) |
| Waiving a finding on text | low | complexity | prose: 26 words |
| Working around a vendored check's finding | medium | complexity | prose: 29 words |
| Deferring a warning you can't fix now | medium | complexity | prose: 255 words |
| Spotting a change that should wait | medium | complexity | prose: 46 words + skill (`do-later`) |
| Handing over a human-only step | high | complexity | prose: 96 words + skill (`writing-handover-issues`) |
| Naming a file, module, or symbol | low | complexity | prose: 22 words |
| Referring to a value from two places | high | correctness | prose: 117 words + check (`shared-constants`) |
| Writing a file that depends on another | medium | complexity | prose: 97 words |
| Committing | medium | complexity | prose: 43 words |
| Depending on platform or runtime behaviour | high | correctness | prose: 31 words |
| Needing a library for a narrow job | medium | complexity | prose: 27 words |
| Answering an edge case a review raised | medium | complexity | prose: 55 words |
| Documenting a procedure | medium | complexity | prose: 40 words |
| Writing code that can silently do nothing | high | correctness | prose: 76 words |
| Persisting anything on a user's machine | medium | correctness | prose: 43 words |
| Driving an external runtime repeatedly | low | complexity | prose: 51 words |
| Automating something that needs live conversation context | medium | complexity | prose: 46 words |
| Writing a pipeline step's exit path | medium | correctness | prose: 26 words |
| Piping a long command through tail | medium | correctness | prose: 87 words |
| Killing a process by pattern | high | correctness | prose: 34 words |
| Working in a fresh checkout or sandbox | low | complexity | prose: 54 words |
| Deciding where a config value lives | medium | complexity | prose: 69 words |
| Handling a value that can be unknown | high | correctness | prose: 103 words |
| Writing a comment | low | complexity | prose: 93 words |

The rules that only apply once an activity is under way are skills: the automerge policy a PR
or chain link carries (`automerge-policy`), landing a process change on the mechanism promotion
ladder (`mechanism-promotion-ladder`), writing a check that scans the repo
(`writing-repo-scanning-checks`), editing a `GENERATED` file (`working-with-generated-files`),
proving an optimisation (`optimising-safely`), changing what the software does with a user's
data (`user-data-disclosure`) and attaching a sub-issue (`filing-sub-issues`); what the ad-hoc
queue's run can reach is `do-later`'s. `RULES.md` keeps a one-sentence pointer for the skills a
session must know to load before it starts.

## Skills

| Skill | Trigger |
|---|---|
| [`writing-repo-scanning-checks`](skills/writing-repo-scanning-checks/SKILL.md) | any edit of a coded or declared check (`engine/checks/**`, a pack's `worldRules/**`, `workRules/**`, a skill's `checks.mjs`, `declared-checks.json`) — held by the guard until loaded |
| [`working-with-generated-files`](skills/working-with-generated-files/SKILL.md) | any edit of a `*GENERATED*` file — held by the guard until loaded |
| [`writing-tests`](skills/writing-tests/SKILL.md) | any edit of a test file — held by the guard until loaded |
| [`authoring-agent-docs`](skills/authoring-agent-docs/SKILL.md) | any edit of a `CLAUDE.md` or `.claude/rules/` file — held by the guard until loaded |
| [`automerge-policy`](skills/automerge-policy/SKILL.md) | opening a PR or filing a chain link that states an `Automerge:` policy |
| [`mechanism-promotion-ladder`](skills/mechanism-promotion-ladder/SKILL.md) | landing a process change as durable rules |
| [`optimising-safely`](skills/optimising-safely/SKILL.md) | optimising code that must behave exactly as before |
| [`user-data-disclosure`](skills/user-data-disclosure/SKILL.md) | changing what the software does with a user's data |
| [`filing-sub-issues`](skills/filing-sub-issues/SKILL.md) | filing an issue that belongs under another |
| [`do-later`](skills/do-later/SKILL.md) | the owner defers a change (`/do-later …`, "after this lands") |
| [`verify-in-production`](skills/verify-in-production/SKILL.md) | immediately after a merge whose proof lives in production |
| [`production-retrospective`](skills/production-retrospective/SKILL.md) | designing or completing an element that earned a design doc or a phased tracking issue |
| [`writing-migration-plans`](skills/writing-migration-plans/SKILL.md) | before any design doc, migration or phased plan |
| [`writing-handover-issues`](skills/writing-handover-issues/SKILL.md) | filing an issue a person will execute |
| [`bug-investigation`](skills/bug-investigation/SKILL.md) | investigating a bug or a fix that didn't hold |
| [`ci-performance-evaluation`](skills/ci-performance-evaluation/SKILL.md) | CI feels slow, or the weekly `ci-performance` task hands over a finding |
| [`file-placement`](skills/file-placement/SKILL.md) | placing, moving or renaming a file |
| [`repo-text-sweeps`](skills/repo-text-sweeps/SKILL.md) | a bulk find-replace, rename or file move |

## Checks

The working-discipline rules with a deterministic signature. The world rules read repo state; the four work rules judge the change and the session in front of you.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `markdown-link-labels` | low | complexity | check: blocking |
| `declared-check-messages` | medium | complexity | check: blocking |
| `declared-check-spec-keys` | medium | correctness | check: advisory |
| `file-placement` | medium | complexity | check: advisory |
| `shared-constants` | high | correctness | check: blocking |
| `warning-suppression` | medium | complexity | check: blocking |
| `rules-line-length` | low | complexity | check: advisory |
| `claude-md-length` | medium | performance | check: advisory |
| `generated-merge-driver` | medium | correctness | check: advisory |
| `catalog-completeness` | medium | complexity | check: blocking |
| `reference-integrity` | medium | correctness | check: blocking |
| `runnable-doc-commands` | high | correctness | check: blocking |
| `task-lifecycle` | medium | complexity | check: blocking |
| `squash-merge-history` | high | correctness | check: blocking |
| `barrier` | high | complexity | check: blocking |

`barrier` is the one check a project has to configure before it does anything: it enforces a
**directed folder-access graph** the repo declares on this pack's entry as `config.barriers.rules`,
and a repo that declares none is silent rather than failing. [barriers.md](barriers.md) is the whole
vocabulary — the rule forms, how a reference is resolved against the tree, the exception kinds, and
how another pack ships a fixed barrier of its own as manifest data. It arrived here when the
`barriers` pack was absorbed (#1681): no project ever chose that pack, it rode in on the baseline's
`requires` closure, and a separate identity for a mechanism everyone already has bought only a
second catalog row and an adoption question nobody had asked for.
