# core

Claudinite's own surface in a repo that runs it: the vendored mount, the declaration that activates a
pack, adopting Claudinite and adopting a pack, and the contract every scheduled task is written to.

**Mandatory.** `basics` `requires` this pack, so the closure vendors its content and materializes its
declaration wherever a declaration is written; the one-time `core-seed` migration record declares it
into members that already exist. Removing the entry is not an opt-out — it is drift, and `core-declared`
reports it.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Reading a rule, check or skill that arrived from Claudinite | 43 | high | correctness | prose + check (`claudinite-isolation`) |
| Wanting a pack's rules to apply here | 47 | high | correctness | prose + check (`core-declared`) |
| Adding a pack | 27 | medium | complexity | prose |
| Setting a project up on Claudinite for the first time | 15 | medium | complexity | prose |
| Deciding which pack owns a lesson | 59 | medium | complexity | prose |
| Judging whether Claudinite is current here | 43 | medium | correctness | prose |
| Writing or changing a scheduled task | 26 | high | correctness | prose + checks (`task-declaration-shape`, `task-declaration-matches-folder`) |
| Answering "why did the mount not update" | 39 | medium | correctness | prose |

## Checks

Each of these asks the same kind of question: **is Claudinite working in this repo** — declared,
converged, gated, scheduled. A repo can fail any of them silently, which is why they are checks and
not prose: the session that has lost its rules is the session least able to notice.

| Rule | Reported as | Severity | Reason | What goes wrong when it fires |
|---|---|---|---|---|
| `core-declared` | blocking | critical | correctness | this pack's entry is gone from `.claudinite-checks.json`, so none of the rules below run and the session cannot tell |
| `rules-index-current` | blocking | critical | correctness | the generated index is missing, stale or unimported — the repo's packs contribute no prose to any session |
| `claudinite-isolation` | blocking | high | complexity | the repo's own code reaches into `.claudinite/`, so the next canon refactor is a breaking migration for code the canon does not own (a declared `forbidReferences` [barrier](../barriers/README.md) edge) |
| `conformance-workflow` | advisory | high | correctness | nothing in CI runs the world sweep unfiltered on a pull request, so conformance is ungated and the maintenance PR never lands |
| `scheduler-workflow-shape` | blocking | high | correctness | the vendored scheduler's cron, concurrency or dispatch guard has drifted — staggering, double-run safety or manual runs break |
| `task-declaration-shape` | blocking | high | correctness | a task declaration the scheduler reads is incomplete or illegal, so the task never fires or fires wrong |
| `task-declaration-matches-folder` | blocking | high | correctness | a declaration disagrees with its folder — discovery drops it into `errors` and every run keeps reporting healthy without it |
| `task-phase-discipline` | advisory | medium | complexity | a task decides not to run after its precondition already said run, hiding the decision from the run records |

The scope cuts the other way too: a rule about how the **canon's own** content is maintained is not
this pack's, however much it looks like one. `catalog-completeness` — `packs/README.md` lists every
`packs/<name>/` — reads as Claudinite machinery and is not: it can only fire in the corpus repo, and
what it guards is a hand-maintained index, not a member's status. It stays in
[basics](../basics/README.md) with the other doc-integrity rules.

## Skills

| Skill | For |
|---|---|
| [`adopt-claudinite`](skills/adopt-claudinite/SKILL.md) | setting a project up on Claudinite for the first time — mount, hooks, checks, skills — and re-baselining one to pick up updates |
| [`adopt-pack`](skills/adopt-pack/SKILL.md) | adding a pack to a repo that already runs Claudinite: declare, interview, re-vendor, scaffold, land |

The adoption skills bundle two more checks of the same kind, over the answers a member stores
against each declared pack's questions:

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `adoption-answers-pending` | blocking | medium | complexity | a declared pack's mandatory adoption questions have been answered, so the pack is configured rather than merely present |
| `interview-answer-stale` | advisory | low | complexity | a stored answer still matches the question it was given for |

## Tasks

| Task | frequency | Runs when |
|---|---|---|
| `update` | daily (02:00 slot) | the mount is behind the canon, or a declared pack moved |
| `adopt-requested-packs` | daily | the repo carries an open pack-adoption request |

`update` is the per-repo self-refresh — the task that converges a member's mount and stamps it. It
is why `core-declared` is blocking: a member runs `update` from its **vendored** copy, and
`discoverTasks` finds only a literally-declared pack's tasks, so a repo that loses this pack's entry
loses its self-refresh, and nothing is left that could deliver it one. That is also why the task
arrived here a change later than the rest of the pack — it moved only once every non-dormant member's
declaration had been read back and confirmed to carry `core`.
