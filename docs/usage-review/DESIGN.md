# Usage review — the corpus's standing feedback loop (design)

> **Status: not implemented.** The end state below is agreed; the plan is its tracking issue.

The corpus that reaches a session — mounted skills, the checks and guards, the prose in every
`RULES.md` — is placed on the promotion ladder by judgment at authoring time, and nothing reads
back whether the placement held. A skill that loads in every session is prose paying a load
round-trip per session; a check that never fires is either a dud or a rule the prose already
carries; an advisory nobody acts on is noise every Stop; a guard that holds every call to load a
four-bullet skill costs a tool call to save a hundred tokens of context. Each of these is
detectable from marks the machinery already leaves in the captured transcripts, and each has an
adaptation a reader can name without judgment. This document specifies the loop that reads
those marks on a schedule and names the adaptation: **measure → judge → act → verify**, each
stage in the pack that already owns that kind of work.

Companion: [skill-usage-metrics](../skill-usage-metrics/DESIGN.md) specifies the fold this
review reads; its §7 names canon curation as the consumer of the fold "in both directions", and
this loop is that consumer, made deterministic and scheduled.

## 1. The one idea

Every misplacement on the ladder has a **signature in the record** — a ratio between two counts
the fold already keeps or can keep — and a **single adaptation** that follows from it. So the
judgment is a table of thresholds over counters, evaluated by code, and the agent is reserved
for the one thing code cannot do: *rewriting* a skill into prose, a trigger into another moment,
a check's fix text into the words a session follows.

| Stage | Task | Pack | Kind | Cadence |
|---|---|---|---|---|
| **Measure** | `usage-fold` (extended) | claudinite-tasks | agentless | daily, as today |
| **Judge** | `usage-review` (new) | claudinite-growth | agentless | weekly, over the trailing four ISO weeks |
| **Act, local** | `growth-extract` (reads the review) | claudinite-growth | opus | daily, as today |
| **Act, canon** | `canon-usage-review` (new) | claudinite-canon-curation | opus | weekly |
| **Act, fleet** | the sheepdog's aggregation of members' review files | Shepherd | — | out of canon scope |
| **Verify** | a `Rule effectiveness` retrospective per experiment the acting stage runs | basics | queue | `Not-before:` + window |

The fold stays a pure data plane — counts, never verdicts — because the dashboard and the fleet
read it as data. The review is a separate task because thresholds are policy, and policy is
re-examined on a different clock from a counter's shape. The acting stages are the existing
agentic runs, each in the pack whose write scope already covers the artifact it would edit: a
member's local packs for `growth-extract`, the `packs/` shelf for canon curation.

## 2. The classes, their signatures and their adaptations

Every row is evaluated over the window (§4), with the floors of §4 applied first. A row whose
denominator is under its floor is *not evaluated* and the report says so — a verdict on three
sessions is a claim nobody made. Thresholds are constants in one module, `review-policy.mjs`,
each named and cheap to re-examine (§8).

### 2.1 Skills

| Class | Signature (window) | Adaptation the report names |
|---|---|---|
| **S1 always loaded** | `skillSessions[s] / sessions ≥ 0.75` | its body is context, not a procedure: move it to the owning pack's `RULES.md` (or narrow a trigger that is far too wide); the report states both costs — tokens × sessions loaded vs tokens × all sessions |
| **S2 never reached** | loads, blocks and trigger fires for `s` all `0`, `sessions ≥ MIN_SESSIONS` | the description or trigger does not name the moment it applies; or the skill is dead — re-describe, or retire |
| **S3 only ever forced** | `(blockedEdit + blockedCall) / loads ≥ 0.9` | the guard, not the description, is what loads it. Small skill (`≤ SMALL_SKILL_TOKENS`): the block costs more than carrying the lines in context — move them, or into the guard's own block text. Large: the guard is doing its job; no change |
| **S4 result trigger that is really a call trigger** | `resultTrigger[s] / toolCalls[tool] ≥ 0.5` for the tool the trigger names | the symptom follows most calls of that tool, so the skill belongs *before* the call: declare `force-load-on-tool-calls` for it and drop the result pattern |
| **S5 unfollowed trigger** | `(fired − followed) / fired ≥ 0.5` | the pattern matches text that merely mentions the symptom (a `403` in prose): tighten it to the tool's own result shape |
| **S6 loaded and still caught** | `skillCaught[s] / skillSessions[s] ≥ 0.3` | the skill's text does not carry the rule its own check enforces: put the rule in the skill's first lines or the check's fix text |

### 2.2 Checks and guards

`checkFindings` counts Stop-hook and CI findings; `guardFires` counts PreToolUse verdicts. A rule
is evaluated over both.

| Class | Signature (window) | Adaptation the report names |
|---|---|---|
| **C1 never fires** | no finding and no guard fire for `r`, with `checks.runs ≥ MIN_RUNS` | with a prose twin (§3.3): the **prose-removal experiment** — delete the prose, keep the check, file the retrospective that reads `checkFindings[r]` a window later (≤ 1 firing means the check alone suffices and context was freed; more means the prose was doing the work and comes back). Without one: confirm its fixture test fails on the violation it exists for; a check whose test cannot be made to fail is a dud, retired |
| **C2 fires on most sessions** | `checkFindings[r].sessions / sessions ≥ 0.5` (blocking) | the corpus default is wrong: carry the lesson *before* the work — a `RULES.md` line, or a pre-edit trigger for the files it fires on — and keep the check as the net. A check whose every firing is followed by the same fix is teaching by red |
| **C3 advisory ignored** | `persisted / advisory ≥ 0.8` | nobody acts on it, so it is noise at every Stop: promote it to blocking if it names a defect, delete it if it names a bias |
| **C4 unsatisfiable** | `relent ≥ 1` | a session could not clear it in two attempts: the condition or the fix text is wrong, never the session |
| **C5 accepted away** | `acceptances[r] ≥ 3`, or a severity override to advisory | the rule is mis-scoped: encode the exemption structurally (a set derived from the tree, a barrier `except` with a reason) or demote it; the report lists the acceptances so their reasons can be read together |
| **C6 enforcement off** | `checks.errors > 0` | the runner failed to launch in a session: a defect, never a quiet day (the fold already counts it; the review names it) |
| **C7 slow** | median `stopMs` this window ≥ `1.25 ×` previous window **and** `≥ 2000 ms`; any rule with `maxMs ≥ 1000` | a regression to localise: the report names the slowest rules from the timing record (§3.2); a declaration quantifying a file-wide `requireSomeFileMatching` over a large tree is the usual shape |
| **G1 guard overruled** | `guardFires[r].advisory / sessions ≥ 0.5` | a bias fired on most sessions and the call ran anyway: the guard is mis-scoped or the bias is not one the corpus holds |

The floor for a rate over sessions is `MIN_SESSIONS` (10); over runs, `MIN_RUNS` (20).

### 2.3 What is deliberately not a class

- **A rare load or a rare firing.** A version-bump skill that loads once a month and a check that
  fires once a quarter are both healthy; the classes above are ratios against a denominator,
  never raw counts, which is why the fold carries denominators at all.
- **Prose.** Nothing in a transcript says which `RULES.md` line a session read. Prose is judged
  only by what it *displaces*: a C1 experiment frees it, an S1 or C2 finding grows it.

## 3. The measurement

### 3.1 New fold counters

All read from the captured transcripts by the fold's existing per-file counting
(`countEntries`), folded per day and per week exactly as `skillLoads` and `checkFindings` are —
keyed maps, zeros implicit, fixed-shape rows declared in the file's `fields` header. Week rows
frozen before a counter existed carry no key for it, and the review reads a missing key as *not
recorded*, never as zero.

| Counter | Key | Row | Read from |
|---|---|---|---|
| `skillLoadsBy` | skill | `[voluntary, blockedEdit, blockedCall, resultTrigger, promptTrigger, command, read]` | a `Skill` tool call, a typed `/command`, or a `Read` of a mounted `SKILL.md` (the guard accepts that as a load, so the fold does too); the cause is the nearest earlier mark for that skill in the same stream since its last load: a PreToolUse block error naming it (`skill-not-loaded`, `skill-not-loaded-for-call`), an injected trigger context naming it, the command tag, else voluntary |
| `skillSessions` | skill | count | distinct session ids with ≥ 1 load, per day; a session spanning midnight counts on both days, so the week figure is a ceiling and says so |
| `skillBlocks` | skill | count | PreToolUse block errors naming the skill — each one a tool call spent |
| `triggerFires` | skill | `[fired, followed]` | injected trigger contexts naming the skill; followed when a load of it comes later in the same capture |
| `toolCalls` | tool name | count | every `tool_use` block, main stream and sidechains — the denominator S4 needs and the one guards read against |
| `guardFires` | rule | `[blocking, advisory]` | the hook's `done exit=2 action-guard <rules>` block text and `advisory action-guard <rules>` stderr lines, both of which reach the transcript |
| `checkFindings` (extended) | rule | `[blocking, advisory, sessions, persisted, relent]` | rendered finding lines (`[SEVERITY] <rule>  <file>[:line]`): `sessions` distinct per day; `persisted` the advisory `(rule, file)` pairs still present in the session's last Stop output; `relent` the rules in the findings block preceding a `loop-guard-relent` |
| `skillCaught` | skill | count | sessions in which the skill was loaded and a check that skill owns (its `checks.mjs`, per the runner's `skillChecks` catalog) fired blocking after the load |
| `checkTiming` | scope, and rule | `[runs, totalMs, maxMs]` | per scope: `Stop: start checks` → `Stop: done` on the same run id (both reach the transcript); per rule: the timing record of §3.2 |

The scope timing is a floor on the Stop hook's cost, not the checks' alone: it includes the
runner's process start. That is the figure a session waits on, so it is the right one.

### 3.2 The runner's timing record

Neither runner reports how long each rule took, so C7 cannot localise anything. Each runner
prints, after its report and whether or not there were findings, one machine line the fold
parses — rendered and parsed in `engine/checks/helpers/check-timing.mjs`, the single home of its
format, the discipline `run-record.mjs` sets for the queue's records:

```
claudinite-check-timing v1 <scope> total=<ms> rules=<n> <rule>=<ms> <rule>=<ms> …
```

Only the `SLOWEST_RULES_REPORTED` (8) slowest rules are named, so the line stays one line on a
catalog of any size. The Stop hook already forwards runner stdout on a passing run, so the line
reaches the transcript on every run; in CI it lands in the job log and counts under the same
rule every check number does — when the session pulled the log in.

### 3.3 What the review reads live, not from the fold

Three inputs are point-in-time facts about the tree, not events in a window, and a windowed
count of a standing population reads as a trend that is not there. The review reads them at run
time from the tree it runs in:

- **The mounted skill catalog**, each skill's estimated tokens (the session summary's own
  estimator) and its declared triggers — what S1 and S3 price, what S4 rewrites.
- **The active rule catalog** (`packRules` over the discovered packs): severity, scope, the
  owning skill, and whether a rule has a **prose twin** — a `RULES.md` bullet in the same pack
  naming the rule id in backticks, or a `references.md` `check:<id>` entry citing a `RULES-n`
  the bullets carry. That is the deterministic definition; a twin an author expressed some other
  way is not seen, and the report says how many rules were judged twin-less.
- **The settings file**: `accept` entries and `rules` overrides per rule, barrier `except`
  entries per barrier rule — C5's whole input.

## 4. The review task

`packs/claudinite-growth/tasks/usage-review/` — `agent_model: none`, `code_work: node worker.mjs`,
`due:weekly`, and one custom precondition term, `review-window-ready`: the fold's week rows
cover at least one ISO week closed since the last review's `window.through`, **and** the window
holds `≥ MIN_SESSIONS` sessions. A quiet repo declines with the count in the reason, and a
declined run costs nothing.

**The window** is the four most recent closed ISO weeks in the fold, compared against the four
before them — every figure in the report is a window against the previous window, and a class
whose previous window lacks the counter says *not recorded* on that side.

**The report** is `.claudinite/local/usage-review.GENERATED.json`: `version`, `generated`,
`window` (`from`, `through`, `sessions`, `runs`, and the same for the previous window),
`floors` (the constants applied), `notEvaluated` (each class whose floor was not met, with the
figure), and `findings` — one entry per (class, subject): the class id, the subject (skill name
or rule id, and the pack it belongs to), the figures behind the verdict for both windows, the
adaptation text, and for C1 the prose twin found. Findings are sorted by class then subject, so
the file is a pure function of its inputs, and the unchanged-compare ignores `generated` alone.

**Delivery** is `deliver-generated.mjs`, `expected_outcome: amend_existing_or_create_new_pr`,
automerge `under:.claudinite/local && generated-file-changes`: one PR accumulates the weeks, and
its body carries the human rendering — a table per class with the figures — since the file is
for machines and the PR is where a person reads it. A week that changes no finding still moves
`window`, so the PR moves weekly and no more.

The run's pinned commit subject, `Claudinite growth: usage review`, joins the `growth-write-scope`
rule's list, so the write stays inside `.claudinite/local/`.

## 5. Who acts, and on what

- **`growth-extract`** reads the review file each run. A finding whose subject lives in this
  repo's local packs is a lesson input with its adaptation already named — S1 moves a local
  skill's body into the local `RULES.md`, C2 writes the line, C3 flips or deletes the local
  check. A finding about mounted canon content is not its business (its write scope is the local
  packs) and it leaves it alone; the report is what carries that evidence upward.
- **`canon-usage-review`** (claudinite-canon-curation, weekly, opus, titled
  `Claudinite canon: usage review`) reads the canon's own review file — the canon is a member of
  itself, mounting its packs from the repo root — and the fleet aggregate where Shepherd has
  landed one, and applies the adaptations to `packs/`. For a C1 finding with a prose twin it
  runs the experiment: removes the prose, keeps the check, and files a **`Rule effectiveness`**
  retrospective (the class the production-retrospective skill proposes) whose brief states the
  expected firing count and the fold field it is read from. For an S4 it rewrites the trigger;
  for an S3 on a small skill it moves the lines. Each adaptation is one PR under the ordinary
  canon review, and the review file it read is cited in the body.
- **Shepherd** aggregates members' review files fleet-wide; the canon knows no member, so the
  file's keys are repo-agnostic (skill names and rule ids) and the aggregate is a sum over
  members with a member count beside each finding. Out of canon scope, noted so the grain fits.
- **The dashboard** renders the growth pack's `dashboard.json`: a `window` widget of findings
  this window against the previous, and a `list` of the newest findings' subjects.

## 6. Alternatives, and why not

- **Judge inside the fold.** No new task, but thresholds would live in the file the dashboard
  and the fleet read as data, and a threshold re-examined would rewrite frozen week rows'
  meaning. The fold counts; the review judges.
- **A review task with its own agent phase**, the ci-performance shape. Acts in the same run,
  but spends a session per week per member on findings whose adaptation is usually an edit an
  existing agentic run already makes on the same corpus; and the detection was asked for
  deterministic, so the agent would have nothing to decide.
- **An issue per finding.** Findings restate until acted on, so issues would restate weekly;
  growth tasks keep no standing tracker; and the acting runs read a file more cheaply than a
  listing.
- **A Markdown report file.** Readable in the GitHub UI, but every consumer would parse prose;
  the PR body carries the rendering and the file carries the data.
- **Daily cadence.** Most days restate the same rows and rarely clear the session floor; a
  week is what the denominators need.
- **Reading `.claudinite-hooks.log`** for the hook marks. It is per machine and unversioned;
  the transcripts are the durable record and already carry every mark the review needs.

## 7. Failure modes, stated

- **A window under the floor** evaluates nothing and says so; no finding is a result only when
  the floors were met, and `notEvaluated` is what distinguishes the two.
- **A counter absent from frozen weeks** leaves its classes *not recorded* until enough weeks
  carry it; the review advances anyway — a partial series beats a wedged one.
- **A finding nobody acts on** restates every week, unchanged. That is the signal that the
  acting stage is broken, and the retrospective (§8) counts exactly that.
- **A false twin.** C1's prose-twin read is textual; an experiment on a wrong twin removes prose
  the check does not cover, and the retrospective's firing count is what brings it back.

## 8. Retrospective brief

The element earns the review the production-retrospective skill defines, a week after
`canon-usage-review` first lands an adaptation. Expectations, and where each is read:

- **Volume.** In this repository, `sessions ≥ 10` per window (the fold's week rows) and 2–8
  findings per review (the review file's history on `main`); zero findings across two reviews
  with the floors met means the thresholds are too loose, more than twelve means too tight.
- **Every class fires at least once in the first two months**, read off the review file's
  history; a class that never fires has a signature nothing in the record produces, and is
  re-examined before it is trusted.
- **Acting.** `growth-extract` consumes ≥ 1 local finding a month (its PR bodies cite the
  review), `canon-usage-review` lands ≥ 1 canon adaptation a month (PRs titled
  `Claudinite canon: usage review`), and at least one C1 experiment has its retrospective filed.
- **Underuse.** A finding restated unchanged for more than four reviews; expected count 0.
- **Misuse.** An adaptation applied from a class under its floor; a prose removal without its
  retrospective; a review PR opened by a run whose precondition should have declined.
- **Overuse.** Review PRs moving on `window` alone for more than four consecutive weeks in a
  repo with no finding — the cadence is finer than the repo's signal.
- **Cost.** The Stop hook's median `stopMs` does not rise by more than the timing line's own
  cost (expected under 5 ms), read from `checkTiming` before and after the runner change.
- **Cheap to re-examine:** every threshold and floor, the window length, the slowest-rules cap,
  the twin definition. **Expensive:** the counter shapes in the fold's header, which every
  member writes from the day they ship, and the timing line's format.
