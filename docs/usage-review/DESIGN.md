# Usage review — expectations, observations, and the rules between them (design)

> **Status: not implemented.** The end state below is under review; the rules in §3 are the part to agree on first.

The corpus that reaches a session — mounted skills, the checks and guards, the prose — is placed
on the promotion ladder by judgment at authoring time, and nothing reads back whether the
placement held. This document specifies the loop that does: each skill **declares what usage it
expects of itself**, the record **observes** what happened, a small set of **readable rules**
compares the two, and every finding carries a **certainty** that decides what may follow from
it. A cause that is known is fixed; a cause that is not is diagnosed, put to the owner, or only
recorded — never fixed on a guess.

Companion: [skill-usage-metrics](../skill-usage-metrics/DESIGN.md) specifies the fold whose
counters this loop reads; its §7 names canon curation as the consumer "in both directions".

## 1. The one idea

```
declared expectation  ──┐
                        ├──  rule  ──►  finding { subject, evidence, certainty, adaptation }
observed record       ──┘
```

- **The expectation** is the skill's own, in its frontmatter (§2). Without it, "zero loads"
  means nothing: a version-bump skill and a broken one both read zero. With it, zero is either
  exactly right or exactly the finding.
- **The record** is the fold (`usage.GENERATED.json`) for rates over weeks, and the raw captures
  still inside retention for the one comparison no counter can make — reading a session and
  asking whether the skill *should* have loaded (§4).
- **The rules** are data, not code: one JSON file of declarations the growth pack ships, each
  rule readable as a sentence, evaluated by one generic evaluator (§3). A local pack may add its
  own rules in the same vocabulary.
- **The certainty tier** is part of the rule, and it is what makes the rules soft. `act` means
  the cause is known and the adaptation follows; `diagnose` means the cause is one of several
  and an agent reads samples before anything moves; `decide` means the remedy is a choice only
  the owner makes; `observe` means the finding is evidence, recorded and carried forward, and
  nothing else.

## 2. What a skill declares about its own usage

Under the frontmatter `metadata` every skill already carries its triggers in
(`force-load-on-*`), one more block:

```yaml
metadata:
  usage:
    expect: routine            # adoption | routine | triggered | rare
    loads-per-sessions: 1 in 5 # routine only: about one load in that many sessions
```

| `expect` | The skill says of itself | What zero loads means |
|---|---|---|
| `adoption` | it is used while a pack is being adopted or set up — a few loads in the weeks after the pack's declaration, then nothing | fine once the adoption window (4 weeks from the pack's declaration commit) has passed; a finding inside it |
| `routine` | ordinary work reaches for it at about the declared rate | a finding when the observed rate falls under half the declared one over the window; the cause is *unknown* (the description may not name the moment, or the moment may not have arisen), so the tier is `diagnose` |
| `triggered` | its declared `force-load-on-*` moments are when it loads, and it expects nothing else | judged against **moments**, not sessions: the calls of the named tool, the edits under the named paths, the prompts matching the named pattern, all counted from the record; loads far under moments is a mechanical fault (`act`) |
| `rare` | it is wanted seldom and says nothing about how seldom | never a finding; only the *always loaded* rule applies |
| *(undeclared)* | | the review lists the skill under `unstated` and evaluates only *always loaded*; the list is itself the nudge to declare |

The pack's declaration commit — the first commit that names the pack in the settings file — is
read from git history, deepened as the fold already deepens it for commit counts; where history
does not reach it, `adoption` rules read *not recorded*.

The block is validated by the skill-frontmatter schema (a closed `expect` set; `loads-per-sessions`
only with `routine`, as `"1 in N"`), so a mis-declared expectation is a `check_the_world` finding at
authoring time, not a silent `unstated`. Checks and guards declare nothing: their signal is their
own firing, and §3 judges it on the tier alone.

## 3. The rules

One file, `packs/claudinite-growth/usage-rules.json`, pointed at a schema. Each rule is five
lines a reader can say aloud: *over these subjects, in this window, above this floor, when this
holds, with this certainty, this follows.* The vocabulary:

- `over`: `skill`, `check`, `guard`, or `checks` (the scope totals). `expect` narrows a skill
  rule to skills declaring that expectation.
- `window`: `4 weeks` — the trailing closed ISO weeks; `previous` in an expression names the
  four before them.
- `floor`: counts that must hold before the rule is evaluated at all; under the floor the
  review records *not evaluated* with the figure.
- `when`: one comparison in a grammar of four shapes — `a / b >= n`, `a / b <= n`, `a = 0`,
  `a >= n` — over the counters of §4, with `median(a)` and `previous` where a rule compares
  windows. Nothing else; a rule that needs more is a coded rule, and there are none.
- `certainty`: `act` | `diagnose` | `decide` | `observe`.
- `finding` and `adaptation`: the sentences a person reads.

The rules, as declared. The evaluator prints each as the sentence the fields spell.

### 3.1 Skills

```jsonc
[
  { "id": "skill-always-loaded",
    "over": "skill", "window": "4 weeks", "floor": { "sessions": 10 },
    "when": "skillSessions / sessions >= 0.75",
    "certainty": "act",
    "finding": "loads in three of every four sessions — it is context wearing a skill's clothes",
    "adaptation": "move its body to the owning pack's RULES.md; the cost either way is stated: tokens × sessions loaded against tokens × all sessions" },

  { "id": "skill-adoption-not-reached",
    "over": "skill", "expect": "adoption", "window": "adoption", "floor": { "sessions": 3 },
    "when": "skillLoads = 0",
    "certainty": "diagnose",
    "finding": "the pack was declared and its adoption-time skill never loaded while the adoption was live",
    "adaptation": "read the adoption sessions: was the step done another way, skipped, or did the description not name it" },

  { "id": "skill-routine-under-rate",
    "over": "skill", "expect": "routine", "window": "4 weeks", "floor": { "sessions": 10 },
    "when": "skillSessions / sessions <= declaredRate / 2",
    "certainty": "diagnose",
    "finding": "loads at under half the rate it declares for itself",
    "adaptation": "sample the sessions where it did not load and ask whether they fell under its description (§4.2); if they did, the description is what to rewrite; if not, the declared rate is" },

  { "id": "skill-triggered-missing-moments",
    "over": "skill", "expect": "triggered", "window": "4 weeks", "floor": { "moments": 5 },
    "when": "skillLoads / moments <= 0.5",
    "certainty": "act",
    "finding": "its declared moments occurred and the skill was not loaded for most of them",
    "adaptation": "the trigger is mechanical, so this is a fault in the declaration or the hook: reproduce one moment against the guard and fix what fails" },

  { "id": "skill-forced-only-small",
    "over": "skill", "window": "4 weeks", "floor": { "skillLoads": 5 },
    "when": "skillBlocks / skillLoads >= 0.9",
    "certainty": "act",
    "finding": "it is only ever loaded because a guard held a call for it, and a block is a tool call spent to read it",
    "adaptation": "a skill under 300 tokens: carry the lines in context or in the guard's own block text; a larger one: no change, the guard is doing its job" },

  { "id": "trigger-fires-unfollowed",
    "over": "skill", "window": "4 weeks", "floor": { "triggerFired": 5 },
    "when": "triggerFollowed / triggerFired <= 0.5",
    "certainty": "diagnose",
    "finding": "its result or prompt trigger fires and the skill is not loaded afterwards",
    "adaptation": "read the fires: a pattern matching text that merely mentions the symptom is tightened; a session ignoring a real symptom is a lesson for the trigger's context text" },

  { "id": "result-trigger-follows-every-call",
    "over": "skill", "window": "4 weeks", "floor": { "toolCalls": 10 },
    "when": "triggerFired / toolCalls >= 0.5",
    "certainty": "diagnose",
    "finding": "the symptom its result trigger names follows most calls of that tool",
    "adaptation": "if the skill's advice is about making the call, load on the call instead (force-load-on-tool-calls); if it is about the symptom, the tool itself is misused and that is the lesson" },

  { "id": "skill-loaded-still-caught",
    "over": "skill", "window": "4 weeks", "floor": { "skillSessions": 5 },
    "when": "skillCaught / skillSessions >= 0.3",
    "certainty": "observe",
    "finding": "sessions that loaded it were still caught by a check the skill owns",
    "adaptation": "none yet — carried forward; repeated across windows it is the case for putting the rule in the skill's first lines" }
]
```

### 3.2 Checks and guards

```jsonc
[
  { "id": "check-never-fires-with-prose-twin",
    "over": "check", "window": "4 weeks", "floor": { "runs": 20 },
    "when": "checkFindings = 0", "and": "proseTwin",
    "certainty": "act",
    "finding": "never fires, and a RULES.md line states the same rule",
    "adaptation": "the prose-removal experiment: delete the prose, keep the check, file the retrospective that reads this counter one window later — at most one firing means the check alone suffices; more means the prose was doing the work and returns" },

  { "id": "check-never-fires",
    "over": "check", "window": "4 weeks", "floor": { "runs": 20 },
    "when": "checkFindings = 0",
    "certainty": "observe",
    "finding": "never fires and has no prose twin",
    "adaptation": "none — a net that has caught nothing is not evidence of a hole; carried forward, and named for the fixture test that proves it can fire" },

  { "id": "check-fires-most-sessions",
    "over": "check", "window": "4 weeks", "floor": { "sessions": 10 },
    "when": "checkSessions / sessions >= 0.5",
    "certainty": "diagnose",
    "finding": "fires blocking in half the sessions or more",
    "adaptation": "read a sample of the firings: real violations each fixed the same way mean the lesson belongs before the work (a RULES.md line, a pre-edit trigger) with the check kept as the net; findings the session argued with mean the check is wrong" },

  { "id": "advisory-ignored",
    "over": "check", "window": "4 weeks", "floor": { "advisory": 10 },
    "when": "advisoryPersisted / advisory >= 0.8",
    "certainty": "decide",
    "finding": "an advisory nobody acts on, printed at every Stop",
    "adaptation": "the owner's call: promote it to blocking if it names a defect, delete it if it names a bias" },

  { "id": "check-unsatisfiable",
    "over": "check", "window": "4 weeks", "floor": {},
    "when": "relent >= 1",
    "certainty": "diagnose",
    "finding": "a session could not clear it in two attempts and the Stop hook let it through",
    "adaptation": "read the relent: a condition the fix text cannot satisfy is a bug in the check; a session that fixed the wrong thing is a lesson for the fix text" },

  { "id": "check-accepted-away",
    "over": "check", "window": "now", "floor": {},
    "when": "acceptances >= 3",
    "certainty": "decide",
    "finding": "carries three or more acceptances or an override to advisory",
    "adaptation": "the owner's call, with the acceptance reasons listed together: encode the exemption structurally, or demote" },

  { "id": "enforcement-off",
    "over": "checks", "window": "4 weeks", "floor": {},
    "when": "errors >= 1",
    "certainty": "act",
    "finding": "the check runner failed to launch in a session — enforcement was silently off",
    "adaptation": "a defect: read the hook log line the fold counted it from and fix the launch" },

  { "id": "checks-slower",
    "over": "checks", "window": "4 weeks", "floor": { "runs": 20, "previous.runs": 20 },
    "when": "median(stopMs) / previous.median(stopMs) >= 1.25", "and": "median(stopMs) >= 2000",
    "certainty": "act",
    "finding": "the Stop hook's checks take a quarter longer than the window before",
    "adaptation": "the timing record names the slowest rules; optimise the named one" },

  { "id": "guard-overruled",
    "over": "guard", "window": "4 weeks", "floor": { "sessions": 10 },
    "when": "guardAdvisory / sessions >= 0.5",
    "certainty": "diagnose",
    "finding": "an advisory guard fires in most sessions and the call runs anyway",
    "adaptation": "read the calls: a guard matching calls it was not written for is narrowed; a bias sessions consistently overrule is not one the corpus holds" }
]
```

What the tiers buy, stated once: of the seventeen rules, six are `act`, and every one of those
names a cause that is mechanical or arithmetic — a guard that did not hold, a runner that did
not launch, a block that costs more than the lines it protects, a timing regression the record
localises, an experiment that is itself the safe probe. Everything whose cause could be one of
two things is `diagnose` or `decide`, and the two weakest signals are `observe`.

## 4. The record

### 4.1 Folded — what the fold gains

All counted per capture file by the fold's existing per-file pass, keyed maps with zeros
implicit, declared in the file's `fields` header. Weeks frozen before a counter existed carry no
key; a rule meeting a missing key reads *not recorded* on that side.

| Counter | Key | Row | Read from |
|---|---|---|---|
| `skillLoadsBy` | skill | `[voluntary, blockedEdit, blockedCall, resultTrigger, promptTrigger, command, read]` | a `Skill` call, a typed `/command`, or a `Read` of a mounted `SKILL.md`; the cause is the nearest earlier mark for that skill since its last load — a PreToolUse block error naming it, an injected trigger context naming it, the command tag, else voluntary |
| `skillSessions` | skill | count | distinct sessions with a load, per day; a session spanning midnight counts twice and the week figure is a stated ceiling |
| `skillBlocks` | skill | count | PreToolUse block errors naming it (`skill-not-loaded`, `skill-not-loaded-for-call`) |
| `triggerFires` | skill | `[fired, followed]` | injected trigger contexts naming it; followed when a load of it comes later in the capture |
| `moments` | skill | count | for a `triggered` skill: calls of the tools it names, `Edit`/`Write` calls under the paths it names, owner prompts matching its patterns — the same resolver the hooks use, run over the transcript |
| `toolCalls` | tool | count | every `tool_use` block, sidechains included |
| `guardFires` | rule | `[blocking, advisory]` | the hook's `done exit=2 action-guard <rules>` block text and `advisory action-guard <rules>` lines, both in the transcript |
| `checkFindings` (extended) | rule | `[blocking, advisory, sessions, persisted, relent]` | rendered finding lines (`[SEVERITY] <rule>  <file>`): `persisted` is the advisory pairs still present at the session's last Stop; `relent` the rules in the block before a `loop-guard-relent` |
| `skillCaught` | skill | count | sessions that loaded the skill and were then caught blocking by a check the skill owns |
| `checkTiming` | scope, rule | `[runs, totalMs, maxMs]` | per scope the `Stop: start checks` → `Stop: done` gap on one run id; per rule the runners' timing record: one line after the report, `claudinite-check-timing v1 <scope> total=<ms> <rule>=<ms> …`, the eight slowest rules, rendered and parsed in one module |

The fold already keeps `sessions`, `checks.runs` and `checks.errors`.

### 4.2 Raw — what only a capture can answer

Two rules (`skill-routine-under-rate`, `skill-adoption-not-reached`) ask whether a skill
*should* have loaded in a session where it did not. No counter says that; a reader must compare
the session's activity with the skill's description. So the review's diagnosis samples up to
five captures per finding from the logs branch — only captures inside retention exist, so the
sample is the last ten days, and the review runs weekly precisely so the sample is always there
— and builds for each a **deterministic digest**: the owner's prompts, the tools called with
their targets, the files edited, the commands run. The agent reads digest and description and
answers one question per sample: *did this session's activity fall under the description?* A
majority yes is a description that does not name its moment; a majority no is a declared rate
that is wrong. The digest, the samples and the answers go into the finding, so the verdict is
re-readable without the captures.

Retention stays the pack's ten-day default; the review needs no more, and a repo that opted
into capture-only (`retention_days: 0`) gets its `diagnose` rules recorded as *not sampled*
rather than judged.

### 4.3 Live — read from the tree, never windowed

- the mounted skill catalog: each skill's estimated tokens, its `usage` block, its triggers;
- the active rule catalog (`packRules`): severity, scope, owning skill, and the **prose twin** —
  a `RULES.md` bullet in the same pack naming the rule id in backticks, or a `references.md`
  `check:<id>` entry citing a `RULES-n` the bullets carry; a twin expressed any other way is
  not seen, and the report counts the rules judged twin-less;
- the settings file: `accept` entries and `rules` overrides per rule, barrier `except` entries;
- the pack declaration commits, for the adoption window.

## 5. When it runs, where, and what performs the work

| Stage | Runs | Scope | What performs it |
|---|---|---|---|
| Measure | daily, `usage-fold` as today | every repo carrying the tasks pack | code |
| Judge | weekly, `usage-review` in claudinite-growth; precondition: a closed week since the last review's window and `sessions ≥ 10` in the window | every subject the repo mounts — local packs **and** the canon it vendors; findings about canon subjects are evidence the repo cannot act on and carries upward | code for every rule; an agent phase requested only when a `diagnose` finding has samples to read |
| Act, local | daily, `growth-extract` as today | this repo's local packs | opus, reading the review file: `act` findings on local subjects applied, `diagnose` verdicts applied where the diagnosis named the fix |
| Act, canon | weekly, `canon-usage-review` in claudinite-canon-curation | the `packs/` shelf, from the canon's own review file (the canon is a member of itself) and, where Shepherd has landed one, the fleet aggregate | opus: applies `act` and settled `diagnose` findings, files `decide` findings as parked discussion issues with the evidence, runs the prose-removal experiment with its retrospective |
| Act, fleet | Shepherd's aggregation of member review files | the fleet | out of canon scope; the file's keys are skill names and rule ids so a sum across members reads |

The review's output is `.claudinite/local/usage-review.GENERATED.json` — `window` (both
windows' bounds and denominators), `notEvaluated` (rule, floor, figure), `unstated` (skills
with no `usage` block), and `findings` sorted by rule then subject, each carrying the rule id,
subject and pack, the figures for both windows, the certainty, the sentences, and for a
diagnosed finding the samples and the answers. Delivered by the shared generated-file helper on
one accumulating auto-merged PR whose body renders the findings as a table per tier; the
unchanged-compare ignores the stamp alone. A finding restated unchanged across windows stays a
finding — the count of restatements is in the row, and it is the retrospective's underuse signal.

## 6. Alternatives, and why not

- **Coded rules** instead of declarations: every threshold would need reading code to know what
  it asserts; the rules are the part a person must be able to review in a sitting.
- **Judging inside the fold**: thresholds would live in the data plane the dashboard and fleet
  read, and a re-examined threshold would rewrite frozen weeks' meaning.
- **One tier, everything acted on**: a skill that did not load has several possible causes and
  only one of them is the description; acting on the first guess rewrites skills that were
  right.
- **No declared expectation**: rates against sessions alone cannot separate rare-and-healthy
  from never-and-broken, which is the distinction the whole review exists to draw.
- **Issues per finding**: findings restate until acted on; growth keeps no standing tracker; a
  file is what the acting runs read.
- **Longer retention for diagnosis**: ten days already covers a weekly sample; more raw logs
  buy nothing the rules read.

## 7. Failure modes, stated

- A window under a floor evaluates nothing and says so; *no findings* is a result only when
  `notEvaluated` is empty.
- A counter absent from frozen weeks leaves its rules *not recorded* until enough weeks carry it.
- A capture-only repo gets no diagnosis and says so; its `act` rules still run.
- A false prose twin: the experiment removes prose the check does not cover, and the
  retrospective's firing count brings it back.
- A description the agent misjudges: the samples and answers are in the finding, so the
  acting run and a person can read the same evidence the verdict was drawn from.

## 8. Retrospective brief

Owed once `canon-usage-review` has landed its first adaptation and lived a week.

- **Volume.** `sessions ≥ 10` per window in this repository; two to eight findings per review
  with the floors met (zero across two reviews means the thresholds are loose, more than twelve
  means tight); read from the review file's history on `main`.
- **Tiers.** `act` findings applied within one acting cycle; `diagnose` findings settled (a
  verdict recorded) within two reviews; `decide` findings each with a parked issue; `observe`
  findings never acted on. Read from the acting PRs' bodies and the issues.
- **Expectations.** Every canon skill carries a `usage` block within a month (the `unstated`
  list empties); read from the review file.
- **Underuse.** A finding restated unchanged for more than four reviews; expected zero.
- **Misuse.** An adaptation applied from a `diagnose` or `decide` finding without its verdict; a
  prose removal without its retrospective.
- **Overuse.** Review PRs moving on `window` alone for more than four weeks; agent phases
  requested with nothing to sample.
- **Cost.** The Stop hook's median `stopMs` rises by no more than the timing line's own cost,
  under 5 ms, read from `checkTiming` across the change.
- **Cheap to re-examine:** every threshold and floor, the tier of any rule, the window, the
  sample size, the twin definition. **Expensive:** the counter shapes in the fold header, the
  `usage` frontmatter vocabulary, the timing line's format.
