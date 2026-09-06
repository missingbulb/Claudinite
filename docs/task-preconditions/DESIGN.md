# Declarative task preconditions

A task declares **`preconditions`**: a list of named conditions the engine
evaluates over the collected signals, and the task runs only when **every**
listed condition holds. The design's goals, in order: **simple and readable
first, extensible second** — a reader asks "what must be true for this task to
run?" and the declaration answers in the conditions' own names, with no comment
needed above it. The evaluator is a sibling of the merge-policy engine
(`packs/claudinite-tasks/precondition-policy.mjs` beside `merge-policy.mjs`),
running at the two sites that ask the same question of the same code: the
scheduler's tick, which files an item on a yes, and the executor's pick, which
re-derives the verdict (tasks-dispatch DESIGN §5).

Why data instead of code, when a function already works:

- **The repeated shapes stop drifting.** The canon's preconditions spell the
  same few gates — "a substantive commit landed", "my previous round's PR is
  still open", "movement or nothing" — in per-task code, each copy with its own
  null-handling and its own reason prose. A term is written once, with its
  three-valued semantics decided once.
- **A declaration becomes statically checkable.** The declaration-shape check
  can read an expression the way it reads an `automerge` policy: unknown terms,
  malformed arguments, a cadence outside the vocabulary and the retired `none`
  are all author-time findings. A function body is opaque to every check.
- **The signal union is derived, never declared.** Every term — built-in or
  task-local — names the signals it reads, so the collector union cannot disagree
  with what the gate actually consults, which a separately declared list could not
  guarantee.

## The grammar

```
preconditions: ['mount-moved || local-packs-changed']
```

- **The list is a conjunction**: `['X', 'Y || Z']` evaluates as
  `X && (Y || Z)`. Every listed condition must hold, and the verdict's `reason`
  is composed from the conditions that held (or the first that did not).
- **`||` joins alternatives inside one condition**, binding within that one
  list entry only.
- **The comma is deliberately the opposite of an `automerge` list.** A merge
  policy *grants* — "any of these diff classes may land", a union, so its comma
  reads `||`. Preconditions *require* — "all of this must be true before the
  task runs", so the comma reads `&&` and `||` lives inside a term. Aligning
  the two was considered and rejected: each field would then read against its
  own English, and a requirements list parsed as a union is exactly the shape
  that made the earlier veto grammar read as a contradiction.
- **`preconditions` is optional, and absence means "not on the schedule".**
  A task with no expression, or an empty one, is never asked by the scheduler
  and runs only from an item somebody created, at whose pick the empty
  expression holds; a non-empty expression puts the task on the schedule. A
  precondition states what must be true of the world or of the task's own run
  history — never that somebody asked, which is true of every run
  (tasks-dispatch DESIGN §5, decision §15.33). `none` is retired: an explicit
  empty marker is a second spelling of absence. A task on the schedule states
  *when* it runs as its first condition — a cadence term — and what it waits
  for after that. The retired `frequency` field is read at one door and
  becomes that first condition (`manual` becomes no expression); nothing else
  reads it.
- **Parameterized terms** carry their argument inline after a colon:
  `no-open-pr-touching:product-wiki/`, `paths-touched-outside:.claudinite/`.
- Conditions are **positively named** — what must be true, never "run always,
  unless". There is no veto class and no marker class.
- Each term contributes its share of `reason` and `context` (a touched-issue
  list, a member roster, a capped path scope with an explicit dropped count),
  so the run's binding scope falls out of the conditions that granted it.

## What is not a precondition

Three things the old precondition functions carried are deliberately homeless
in the expression, because they are not "should this run fire now?" questions:

- **Repo shape.** "This repo has local packs", "this repo ships the store
  pipeline", "this repo is a canon home with a fleet token" are facts about the
  repo that adoption settled, not questions worth re-asking every run. A repo
  that carries a pack but not one task's subject disables that task in its own
  `.claudinite-settings.json` — `taskScheduler.disabledTasks:
  ['<pack>/<task>']` — which the scheduler reads before asking anything.
- **Scope.** Which files, PRs or members a granted run works on is the
  worker's decision, made in the work sections (task.md, the code-work) from
  the same signals — e.g. whether a substantive default-branch move widens a
  triage from the touched issues to every open one. The preconditions decide
  run or no-run, nothing else.
- **Standing instruction and config** (a `pack_paths` list, a read-only
  constraint) — the work sections'.

## Fail direction: loud, never a quiet skip

This is the one deliberate inversion from the merge-policy engine. An automerge
policy that cannot be resolved fails closed to "nothing merges", which parks a
PR in front of a person — safe. A precondition that failed closed to "skip"
would be permanent, silent staleness: nothing in the repo goes red when a task
stops running. So an unknown term name, a malformed argument, or a term whose
signal is unreadable returns `{ error }` — a failed run parked in the failure
lane where the re-queue lever retries it — never a decline. A decline is a
decision about the world, and one taken on data that was not there is a guess
whose cost is unbounded.

## The term vocabulary — two homes

**Built-ins** live in one place, `packs/claudinite-tasks/precondition-policy.mjs`,
as predicates over fields the signal collectors
(`packs/claudinite-tasks/signals/index.mjs`) already produce. The set is small
— the run-history conditions that say *when*, the movement conditions every
repo shares, and the pending-PR conditions.

**The run-history terms** come first, in this table and in a declaration. They
read the `runs` signal — the task's own unqualified `[claudinite-work]` items
over a 40-day horizon, newest first, the item under evaluation excluded — and
they are judged before any other signal is collected, so a task whose cadence
declines costs no read at all (tasks-dispatch DESIGN §5 owns the model):

| term | holds when | signal |
| --- | --- | --- |
| `due:<daily\|weekly\|monthly>` | no run of this task started or ended since that cadence's most recent anchor on the repo's `taskScheduler` schedule — fixed hours, no drift | `runs` |
| `last-run-over:<12h\|1d\|7d>` | the newest run started more than that long ago, or there is no run in the horizon — elapsed, so the hour drifts by up to a tick's gap each period | `runs` |
| `last-run-not-failed` | the newest run does not stand at a `needs-human-failure` park; only the newest speaks. Declared by a task that must not run past its own failure — never an engine default | `runs` |

`due:` and `last-run-over:` hold on a woken item without reading the history —
the wake stands in for the cadence — while every other condition still applies.

**The movement and pending-PR terms**:

| term | holds when | signal |
| --- | --- | --- |
| `repo-active` | the repo saw non-task activity in the window: a substantive commit, a non-task issue or PR touched, or a session captured | `commits`, `issues`, `prs`, `conversationLogs` |
| `substantive-change` | a substantive default-branch commit landed in the window | `commits` |
| `any-commit` | any default-branch commit landed — task-authored included, for tasks that measure the machinery itself | `commits` |
| `session-captured` | a conversation log was stamped inside the window | `conversationLogs` |
| `issues-touched` | a non-task issue moved in the window (context: the touched set) | `issues` |
| `prs-touched` | a non-task open PR was opened or updated in the window | `prs` |
| `mount-moved` | a declared pack's vendored files changed in the window (context: the packs) | `sharedMount` |
| `commits-under:<prefix>` | the window's commits touched a path under `<prefix>` | `commits` |
| `commits-outside:<prefix>` | the window's commits touched a path outside `<prefix>` (context: the capped path list plus an explicit dropped count) | `commits` |
| `no-open-pr-touching:<dir>` | no open PR changes a path under `<dir>` — an open PR whose paths could not be read counts as pending, because the condition exists so an unreviewed round is never stacked on one in flight | `prs` |
| `no-open-pr-titled:<prefix>` | no open PR's title starts with `<prefix>` — the previous round has landed | `prs` |

**Task-local terms** are the extension mechanism: a task whose gate is its own
— an age against a configured retention, a manifest against a release tag, a
fleet read — ships a **`preconditions.mjs` beside its `task.mjs`**, exporting
`terms`: a map from term name to
`{ signals, takesArg?, holds(signals, { arg, config, item, windowDays, now, schedule }) }`
where `holds` returns `{ holds, reason?, context? }` or `{ error }`. The
evaluator resolves a name against the built-ins first, then the task's own
file; the namespace is flat, a collision is loud, and an unknown name is
`{ error }`. The term's code lives beside its only consumer, so reading the
declaration and reading the gate are one `cd` apart. Current task-local terms:
`log-past-retention` (logs-prune), `manifest-ahead` (store-release),
`fleet-local-packs-changed` (growth-promote), and `request-eligible`
(implement-request — the push-permission security check, unchanged in
substance, relocated beside its declaration). A term that reads the item it is
handed declares `needsItem`; the scheduler's tick has no item to judge it
against, so a task whose expression carries one is not on the schedule
(`isScheduledTask`) — `request-eligible` is the one such term.

`preconditions` is the only gate a task declares. A task-local term expresses
everything the retired `precondition` function did while staying pure over its
inputs — the engine hands it the instant its verdict is for, so even a gate whose
subject is the clock is assertable at a chosen moment — and the declaration stays
readable at a glance. The contract and the declaration-shape check both reject
the retired `precondition` and `precondition_signals` spellings **by name**, so a
declaration carrying one is told what replaced it rather than reading as a task
that forgot its gate.

Because a member's engine and packs travel in one vendor set, no member ever
holds an engine that cannot read its vendored packs' declarations. A member's own
local task files are the case that does not converge, which is why they were
migrated before the engine dropped the form rather than after: an invalid
declaration is skipped by discovery with a recorded error rather than failing the
mount, so the task would otherwise have stopped running with nothing red to say
so.

## The window — since this task's newest run started

Every movement term is judged over a window, and the window is the task's own
(`packs/claudinite-tasks/queue/signals.mjs`): from the instant its newest run
started to now, so a task reads exactly what moved since it last looked, and
one that declined for a month then sees the month. A run is any unqualified
item of the task; a `rejected` one — asked, said yes, declined at pick — did
nothing and does not move the seam, so the next ask sees what it saw. With no
run in the horizon the window is the task's own cadence — the `due:` period or
the `last-run-over:` duration, a day for a task stating neither — plus an hour
of slack. The `runs` signal carries the window it decided, which is where
`windowDays` comes from for a term whose dimension reports an age rather than a
windowed flag (the conversation-logs branch).

## The silence gate

**No task runs on a silent repo unless its declaration says so — and the
declaration says so positively.** A repo is *silent* over a window when it saw
no substantive commit, no non-task issue touch, no non-task PR touch, and no
captured session — where *a scheduled task's own output counts as silence*: a
task-authored PR merging, or its commits landing, is the machinery running, not
the project moving, and a fleet of tasks must not keep each other awake.

The gate needs no operator of its own, because the vocabulary carries it:

- **Movement terms are non-task by construction.** A task-authored commit, PR
  or issue never satisfies `substantive-change`, `issues-touched` or
  `prs-touched` — so every movement-gated task is silence-safe by its own
  conditions.
- **A cadence-only task that should sleep on a silent repo states
  `repo-active`** beside its cadence — the positive umbrella over all four
  activity dimensions. `rule-revalidation`, `prose-to-checks-sweep` and
  `wiki-growth` carry it: their subject is the world, but their value is zero
  on a repo nobody works in, and the first active window resumes them.
- **A task whose trigger is not repo movement states its cadence term and
  nothing about the repo**, and that absence of any movement term is visible
  in the declaration: the levers (no `preconditions` — the item somebody
  created is the mandate), the fleet sweeps (`['due:daily']`, `['due:weekly']` — the
  fleet is the subject, not this repo), `update` (`['due:daily']` — the input
  is the canon, which moves when this repo does not), `upstream-watch`
  (`['due:monthly']` — the canon home curates its shelf on the world's
  clock), `logs-prune` (`['due:daily', 'log-past-retention']` — a clock
  crossing a boundary, which must keep firing on exactly the repos that went
  quiet), and `usage-fold` (`['due:daily', 'any-commit || session-captured']`
  — task-authored movement is exactly what the aggregate folds).

### Classifying task output structurally

The silence classification must not depend on what a task happened to title its
PR. Every delivery lane that commits on a task's behalf (`land-pr.mjs`,
`deliver-generated.mjs`, the queue's PR delivery) stamps a commit trailer:

```
Claudinite-Task: <pack>/<task>
```

The non-task movement terms read it: a commit carrying the trailer is silent,
and a touched or merged PR whose head commits carry it is silent — one commit
read per in-window PR, the same bounded cost profile as the collector's
existing per-PR file reads. The existing exclusions (bot authors, the
housekeeping title regex, corpus-only paths) remain, both because history
predating the trailer still needs classifying and because they also cover
non-task housekeeping; the trailer is the authority for everything written
after it exists. The trailer is stamped by the writer, so a new task is
classified correctly on its first run with nothing to remember.

## The declarations

Every canon task on the schedule begins its expression with its cadence term;
a task that runs only from an item somebody created declares no expression
(`packs/*/tasks/*/task.json` and the built-in under
`packs/claudinite-tasks/queue/tasks/`):

```
ci-performance:          ['due:weekly', 'substantive-change || prs-touched']
store-release:           ['due:daily', 'manifest-ahead || substantive-change']
growth-discover-packs:   ['due:weekly']
growth-promote:          ['due:daily', 'fleet-local-packs-changed']
upstream-watch:          ['due:monthly']
deploy-oauth-exchange:   (no preconditions — not on the schedule)
publish-pages:           ['due:daily', 'mount-moved || commits-under:.claudinite-settings.json
                                       || commits-under:.claudinite-checks.json']
fleet-add-missing-packs: ['due:weekly']
fleet-baseline:          (no preconditions — not on the schedule)
fleet-pack-seeds:        ['due:daily']
fleet-roster:            ['due:daily']
growth-dedup:            ['due:weekly', 'mount-moved || commits-under:.claudinite/local']
growth-extract:          ['due:daily', 'substantive-change']
logs-prune:              ['due:daily', 'log-past-retention']
prose-to-checks-sweep:   ['due:weekly', 'repo-active']
rule-revalidation:       ['due:weekly', 'repo-active']
adopt-requested-packs:   (no preconditions — not on the schedule)
update:                  ['due:daily']
task-janitor:            ['due:daily']
usage-fold:              ['due:daily', 'any-commit || session-captured']
verify-production:       (no preconditions — not on the schedule)
wiki-growth:             ['due:weekly', 'repo-active']
improve-comments:        ['due:weekly', 'substantive-change', 'commits-outside:.claudinite/']
tidy-issues:             ['due:daily', 'issues-touched']
tidy-prs:                ['due:weekly', 'prs-touched']
implement-request:       ['request-eligible']   (reads the item — not on the schedule)
```

A declaration that still carries `frequency` enters by one door,
`normalizeTaskDeclaration` in `packs/claudinite-tasks/task-contract.mjs`: the
field becomes the cadence term it always meant (`due:<cadence>`; `manual`
drops the field and adds no term), first in the expression, a `none` beside it
is dropped, and the field is deleted, so nothing downstream reads it.
`legacy-task-fields` advises the holder; the tolerance retires one convergence
window after #1725 ships.

## Alternatives

- **Union semantics with vetoes (the automerge shape: allow terms,
  `reject:`/`unless:` to narrow, exemption markers).** Rejected:
  "preconditions" reads as requirements, so a union list beside a veto parses
  as a contradiction — run always, or not? — and the negative phrasing hides
  what the precondition *is*. Conjunction plus `||` spells every real gate more
  directly, and the markers dissolve: the cadence term says when, and the rest
  says what.
- **Scope terms in the expression (`widen:`).** Rejected: which targets a
  granted run works on is scope — the worker's decision, from the same signals
  — and folding it into the trigger grammar made the declarations harder to
  read for something that never changed the run/no-run answer.
- **Repo-shape terms (`ships-pipeline`, `local-packs-present`,
  `mount-present`, a fleet-token probe).** Rejected: those are adoption-time
  facts re-asked nightly. Settings-level disablement
  (`taskScheduler.disabledTasks`) answers them once, where the repo's other
  scheduling choices live.
- **An implied `repo-active` conjunct on every expression, with an opt-out.**
  Rejected: the gate would be invisible exactly where a reader audits a task's
  trigger, and present-by-absence means undecided-by-default.
- **A central declared-terms file (a `precondition-rules.json` beside
  `merge-rules.json`).** Rejected in favour of task-local `preconditions.mjs`:
  every current custom term has exactly one consumer, and a term beside its
  task is found by the reader the declaration just sent looking — a central
  registry re-creates the distance the vocabulary exists to remove.
- **Extending the housekeeping title regex instead of a trailer.** Rejected:
  every new task title is a new leak, discovered only as a task re-armed by its
  own output — the failure mode the corpus-only exclusion was itself a patch
  for.
- **A cadence field beside the expression, with the engine deciding at the
  anchor** (`frequency`, and a scheduler that remembered its asks). Rejected
  in tasks-dispatch DESIGN §15.33: the engine's calendar was a second clock and
  its memory a second authority, and every place it kept state was a place a
  dropped tick or a rename could eat a run. The cadence is a condition like
  any other, read off the task's own run history at both sites.
- **Keeping all preconditions as code.** The status quo: the repeated gates
  drift copy by copy, none of it is statically checkable, and a standard
  requirement like the silence gate lands as 25 hand edits plus review
  vigilance instead of one vocabulary the declarations share.
