# Usage review — expectations, observations, and the rules between them (design)

> **Status: in flight.** Every section below is built but none is proven in production - the
> counters in [usage-fold](../../packs/claudinite-tasks/tasks/usage-fold/README.md), the rules in
> [`usage-rules.json`](../../packs/claudinite-growth/usage-rules.json), the review and the triage in
> [claudinite-growth](../../packs/claudinite-growth/README.md). What no test can show is the part
> only a scheduled run can: that the task opens its pull request, files its issues and closes them
> the day a finding clears. This doc goes once that reads back true, its sections already living in
> those READMEs and its decisions on the elements' provenance files.

The corpus that reaches a session — mounted skills, the checks and guards, the prose — is placed
on the promotion ladder by judgment at authoring time, and nothing reads back whether the
placement held. This document specifies the loop that does: each skill **declares what usage it
expects of itself**, the record **observes** what happened, a small set of **readable rules**
compares the two, and every finding carries how well its **cause** is known and what a fix would
likely be. The review **changes nothing and writes nothing outside its own file** — not a pack
element, not a provenance log. It is an analysis with a recommendation attached, run by code
alone. A separate weekly stage, `usage-triage`, turns a finding that has lasted into a proposed
change, as a pull request that **merges only when the owner merges it** (§6); the element's
provenance records that change, and only if it lands (§7). Nothing in the loop merges on its own,
so a rule in §3 that turns out to be wrong costs a declined pull request and leaves no trace.

Companion: [`usage-fold`](../../packs/claudinite-tasks/tasks/usage-fold/README.md) is the fold
whose counters this loop reads, and canon curation consumes that fold in both directions; this
review is what gives that consumer something to read.

## 1. The one idea

```
declared expectation  ──┐
                        ├──  rule  ──►  finding { subject, evidence, cause, recommendation }
observed record       ──┘
```

- **The expectation** is the skill's own, in its frontmatter (§2). Without it, "zero loads"
  means nothing: a version-bump skill and a broken one both read zero. With it, zero is either
  exactly right or exactly the finding.
- **The record** is the fold (`usage.GENERATED.json`) for rates over the window, plus a
  deterministic digest of the captures still inside retention for the one comparison no counter
  makes — what a session was doing when a skill did not load (§4.2).
- **The rules** are data, not code: one JSON file of declarations the growth pack ships, each
  rule readable as a sentence, evaluated by one generic evaluator (§3). A local pack may add its
  own rules in the same vocabulary.
- **The cause confidence** is part of the rule: `known` where the arithmetic or the mechanism
  leaves one cause, `probable` where one cause is likeliest but another is possible, `unknown`
  where the finding is evidence only. It tells the reader how much the recommendation is worth,
  and nothing else follows from it automatically.

## 2. What a skill declares about its own usage

Under the frontmatter `metadata` every skill already carries its triggers in
(`force-load-on-*`), one more block:

```yaml
metadata:
  usage:
    expect: triggered          # adoption | triggered | judgment
```

Each value names **how** the skill expects to be reached, never how often. A rate an author
states is a guess about the future: the record cannot contradict it, so a finding computed
against one measures the guess rather than the skill. The three below are each a claim about a
mechanism, which the record can and does contradict.

| `expect` | The skill says of itself | What zero loads means |
|---|---|---|
| `adoption` | it is used while a pack is being adopted or set up - a few loads in the weeks after the pack's declaration, then nothing | fine once the adoption window (4 weeks from the pack's declaration commit) has passed; a finding inside it |
| `triggered` | its declared `force-load-on-*` moments are when it loads, and it expects nothing else | judged against **moments**, not sessions: the calls of the named tool, the edits under the named paths, the prompts matching the named pattern, all counted from the record; loads far under moments has a `known` cause, a mechanical fault |
| `judgment` | it is loaded when the model judges its description fits the work | nothing follows from a count either way; only the *always loaded* rule applies |
| *(undeclared)* | | the review lists the skill under `unstated` and evaluates only *always loaded*; the list is itself the nudge to declare |

The pack's declaration commit - the first commit naming the pack in the settings file - is read
from git history, deepened as the fold already deepens it; where history does not reach it,
`adoption` rules read *not recorded*.

`expect` is the block's only key, and a second one is refused rather than ignored: the block
exists so a reader can tell what a zero means, and a key nothing reads is a claim the record
never tests. The check also settles the one half of an expectation a file can contradict - a
skill expecting `triggered` while declaring no force-load trigger has no moments to be judged
against. The converse is deliberately allowed: a skill may carry a trigger and still expect most
of its loads by judgment, which is a real claim about itself. Checks and guards declare nothing:
their signal is their own firing.

## 3. The rules

One file, `packs/claudinite-growth/usage-rules.json`, pointed at a schema. Each rule is a few
lines a reader can say aloud: *over these subjects, in this window, above this floor, when this
holds, the cause is this well known, and this is what it usually means.* The vocabulary:

- `over`: `skill`, `check`, `guard`, or `checks` (the scope totals). `expect` narrows a skill
  rule to skills declaring that expectation.
- `window`: `28 days` — the trailing window; `previous` in an expression names the 28 before.
  `adoption` is the skill's adoption window; `now` is a live read of the tree.
- `floor`: counts that must hold before the rule is evaluated at all; under the floor the
  review records *not evaluated* with the figure.
- `when`: one comparison in a grammar of four shapes — `a / b >= n`, `a / b <= n`, `a = 0`,
  `a >= n` — over the counters of §4, with `median(a)` and `previous.` where a rule compares
  windows, and an optional `and` naming a live predicate. Nothing else; a rule that needs more
  is a coded rule, and there are none.
- `cause`: `known` | `probable` | `unknown` — how well the record alone settles the cause.
- `causes`: the possible causes in likelihood order, each with the discriminator that tells it
  apart where one exists — a counter, a digest, a line in the sample. For a `known` rule the
  list is what the arithmetic already settled; for `probable` and `unknown` it is the search
  order a reader works through.
- `open`: `true` where the list is only what its authors thought of, so a reader may find a
  cause not on it and says so; `false` where the list is closed by the mechanism.
- `finding` and `recommendation`: the sentences a person reads.

The evaluator prints each rule as the sentence its fields spell.

### 3.1 Skills

```jsonc
[
  { "id": "skill-always-loaded",
    "over": "skill", "window": "28 days", "floor": { "sessions": 10 },
    "when": "skillSessions / sessions >= 0.75",
    "cause": "known",
    "causes": [
      "its body is guidance every session needs — discriminator: most loads are voluntary (`skillLoadsBy`)",
      "a force-load pattern matches most edits or calls — discriminator: most loads are blocked"
    ],
    "open": false,
    "finding": "loads in three of every four sessions — it is context wearing a skill's clothes",
    "recommendation": "move its body to the owning pack's RULES.md; the cost either way is stated: tokens × sessions loaded against tokens × all sessions" },

  { "id": "skill-adoption-not-reached",
    "over": "skill", "expect": "adoption", "window": "adoption", "floor": { "sessions": 3 },
    "when": "skillLoads = 0",
    "cause": "unknown",
    "causes": [
      "the description does not name the adoption moment — digests show the step being done",
      "the step was done another way, by prose or by hand — digests show it without the skill",
      "the step was skipped — digests show no such step",
      "the pack was declared before its skill was mounted — the declaration commit predates the mount stamp"
    ],
    "open": true,
    "finding": "the pack was declared and its adoption-time skill never loaded while the adoption was live",
    "recommendation": "read the adoption sessions' digests: was the step done another way, skipped, or did the description not name it" },

  { "id": "skill-triggered-missing-moments",
    "over": "skill", "expect": "triggered", "window": "28 days", "floor": { "moments": 5 },
    "when": "skillLoads / moments <= 0.5",
    "cause": "known",
    "causes": [
      "the trigger pattern does not match the real call or path shape — the moments counted by the hook resolver differ from the declaration's intent",
      "the hook failed or timed out — `deadline` or `hook-failed` lines in the window",
      "once-per-session semantics: the skill loaded once and later moments in the session are counted unloaded — a counting artifact, discriminator: `skillSessions` near the sessions with moments"
    ],
    "open": false,
    "finding": "its declared moments occurred and the skill was not loaded for most of them",
    "recommendation": "the trigger is mechanical, so this is a fault in the declaration or the hook: reproduce one moment against the guard" },

  { "id": "skill-forced-only-small",
    "over": "skill", "window": "28 days", "floor": { "skillLoads": 5 },
    "when": "skillBlocks / skillLoads >= 0.9", "and": "tokens <= 300",
    "cause": "known",
    "causes": [
      "the guard does the loading and the description never triggers a voluntary load — the one cause; the question is only whether the lines are worth a block"
    ],
    "open": false,
    "finding": "it is only ever loaded because a guard held a call for it, and each block is a tool call spent to read a few lines",
    "recommendation": "carry the lines in context or in the guard's own block text" },

  { "id": "trigger-fires-unfollowed",
    "over": "skill", "window": "28 days", "floor": { "triggerFired": 5 },
    "when": "triggerFollowed / triggerFired <= 0.5",
    "cause": "probable",
    "causes": [
      "the pattern matches text that merely mentions the symptom — the fire contexts show prose, not a tool's own result",
      "the session judged the symptom irrelevant and moved on — the contexts show a real symptom and a next step that ignores it",
      "the context landed in a subagent stream that had already returned — the fire is on a sidechain entry"
    ],
    "open": true,
    "finding": "its result or prompt trigger fires and the skill is not loaded afterwards",
    "recommendation": "usually a pattern matching text that merely mentions the symptom — tighten it to the tool's own result shape; the fires' contexts are in the finding" },

  { "id": "result-trigger-follows-every-call",
    "over": "skill", "window": "28 days", "floor": { "toolCalls": 10 },
    "when": "triggerFired / toolCalls >= 0.5",
    "cause": "probable",
    "causes": [
      "the advice is about making the call, so it belongs before it — the skill's text reads as a how-to",
      "the tool is misused in a way the symptom reports — the skill's text reads as a diagnosis",
      "the pattern is too broad and matches normal output — the fire contexts show no symptom"
    ],
    "open": false,
    "finding": "the symptom its result trigger names follows most calls of that tool",
    "recommendation": "if the skill's advice is about making the call, load on the call instead (force-load-on-tool-calls); if it is about the symptom, the tool is being misused and that is the lesson" },

  { "id": "skill-loaded-still-caught",
    "over": "skill", "window": "28 days", "floor": { "skillSessions": 5 },
    "when": "skillCaught / skillSessions >= 0.3",
    "cause": "unknown",
    "causes": [
      "the skill's text does not state the rule its check enforces — the rule is absent from the body",
      "the rule is stated but buried — it is present, past the first screen",
      "the skill loaded after the edits it governs — the load follows the caught edits in the session",
      "the check is stricter than the skill says — the finding's fix text names something the skill does not"
    ],
    "open": true,
    "finding": "sessions that loaded it were still caught by a check the skill owns",
    "recommendation": "none yet — evidence carried forward; repeated across windows it is the case for putting the rule in the skill's first lines" }
]
```

### 3.2 Checks and guards

```jsonc
[
  { "id": "check-never-fires-with-prose-twin",
    "over": "check", "window": "28 days", "floor": { "runs": 20 },
    "when": "checkFindings = 0", "and": "proseTwin",
    "cause": "probable",
    "causes": [
      "the prose pre-empts every violation — sessions loading the pack do the thing the check guards",
      "the check is unreachable — its scan pattern or scope selects nothing in this tree",
      "nobody does the thing at all here — the guarded files or calls are absent from the window"
    ],
    "open": false,
    "finding": "never fires, and a RULES.md line states the same rule",
    "recommendation": "a candidate for the prose-removal experiment: delete the prose, keep the check, read this counter one window later — at most one firing means the check alone suffices; more means the prose was doing the work" },

  { "id": "check-never-fires",
    "over": "check", "window": "28 days", "floor": { "runs": 20 },
    "when": "checkFindings = 0",
    "cause": "unknown",
    "causes": [
      "nobody does the thing at all here — the guarded files or calls are absent from the window",
      "the check is unreachable — its scan pattern or scope selects nothing in this tree",
      "a sibling check catches the violation first — a check with overlapping scope fires instead",
      "the check's fixture is the only violator it has ever seen — a test that passes and nothing else"
    ],
    "open": true,
    "finding": "never fires and has no prose twin",
    "recommendation": "none — a net that has caught nothing is not evidence of a hole; carried forward, with the fixture test that proves it can fire named" },

  { "id": "check-fires-most-sessions",
    "over": "check", "window": "28 days", "floor": { "sessions": 10 },
    "when": "checkSessions / sessions >= 0.5",
    "cause": "probable",
    "causes": [
      "the lesson is not carried before the work — every firing is fixed the same way and the fix is the rule",
      "the check is wrong or too broad — the sample shows findings the session argued with or accepted",
      "a pre-edit guard is missing — the violation is a call shape a PreToolUse guard could hold",
      "one session's habit — the firings cluster in one session id"
    ],
    "open": true,
    "finding": "fires blocking in half the sessions or more",
    "recommendation": "usually the lesson belongs before the work (a RULES.md line, a pre-edit trigger) with the check kept as the net; if the findings were argued with, the check is wrong — a sample of the findings is attached" },

  { "id": "advisory-ignored",
    "over": "check", "window": "28 days", "floor": { "advisory": 10 },
    "when": "advisoryPersisted / advisory >= 0.8",
    "cause": "known",
    "causes": [
      "it names a bias, not a defect — nothing to fix, so nothing is fixed",
      "it names a defect but its fix text is not actionable — sessions try and the pair persists",
      "it fires on files the session cannot edit — generated files or the mount"
    ],
    "open": false,
    "finding": "an advisory nobody acts on, printed at every Stop",
    "recommendation": "promote it to blocking if it names a defect, delete it if it names a bias — the choice is the owner's" },

  { "id": "check-unsatisfiable",
    "over": "check", "window": "28 days", "floor": {},
    "when": "relent >= 1",
    "cause": "probable",
    "causes": [
      "the condition cannot be satisfied by following the fix text — the relent's block shows the same finding after a fix attempt on the named file",
      "the finding is on a file the session cannot edit — generated or mounted",
      "two different fixes each cleared one finding and raised another — the two blocks differ"
    ],
    "open": false,
    "finding": "a session could not clear it in two attempts and the Stop hook let it through",
    "recommendation": "usually a condition the fix text cannot satisfy; the relent's findings block is attached" },

  { "id": "check-accepted-away",
    "over": "check", "window": "now", "floor": {},
    "when": "acceptances >= 3",
    "cause": "known",
    "causes": [
      "the rule is mis-scoped for this tree — the acceptance reasons name a structural class of file",
      "the files are genuinely exceptional — the reasons name one-off circumstances"
    ],
    "open": false,
    "finding": "carries three or more acceptances or an override to advisory",
    "recommendation": "encode the exemption structurally, or demote; the acceptance reasons are listed together" },

  { "id": "enforcement-off",
    "over": "checks", "window": "28 days", "floor": {},
    "when": "errors >= 1",
    "cause": "known",
    "causes": [
      "an engine module failed to load — the hook log names the module",
      "a pack failed to load — the hook log names the pack",
      "the runtime is missing or wrong — the launch error names node"
    ],
    "open": false,
    "finding": "the check runner failed to launch in a session — enforcement was silently off",
    "recommendation": "a defect; the hook log line it was counted from is attached" },

  { "id": "checks-slower",
    "over": "checks", "window": "28 days", "floor": { "runs": 20, "previous.runs": 20 },
    "when": "median(stopMs) / previous.median(stopMs) >= 1.25", "and": "median(stopMs) >= 2000",
    "cause": "known",
    "causes": [
      "one rule regressed — the timing record's slowest rule moved",
      "the catalog grew — more rules, none slower",
      "the tree grew — every scanning rule slower in proportion"
    ],
    "open": false,
    "finding": "the Stop hook's checks take a quarter longer than the window before",
    "recommendation": "the timing record names the slowest rules; they are listed" },

  { "id": "guard-overruled",
    "over": "guard", "window": "28 days", "floor": { "sessions": 10 },
    "when": "guardAdvisory / sessions >= 0.5",
    "cause": "probable",
    "causes": [
      "the guard matches calls it was not written for — the sample's calls do not exhibit the bias",
      "the bias is not one sessions hold — the calls exhibit it and proceed",
      "the guard's text does not say what to do instead — the calls proceed unchanged after it"
    ],
    "open": true,
    "finding": "an advisory guard fires in most sessions and the call runs anyway",
    "recommendation": "usually a guard matching calls it was not written for — narrow it; a sample of the calls is attached" }
]
```

Every finding is attached to its evidence: the figures for both windows, and for the rules
that say so, a sample of the concrete events (fires, findings, calls) drawn from the captures
still inside retention. A reader never has to go back to a transcript to judge a finding.

## 4. The record

### 4.1 Folded — what the fold gains

All counted per capture file by the fold's existing per-file pass, keyed maps with zeros
implicit, declared in the file's `fields` header. Weeks frozen before a counter existed carry no
key; a rule meeting a missing key reads *not recorded* on that side.

| Counter | Key | Row | Read from |
|---|---|---|---|
| `skillLoadsBy` | skill | `[voluntary, blockedEdit, blockedCall, resultTrigger, promptTrigger, command, read]` | a `Skill` call, a typed `/command`, or a `Read` of a mounted `SKILL.md`; the cause is the nearest earlier mark for that skill since its last load — a PreToolUse block error naming it, an injected trigger context naming it, the command tag, else voluntary |
| `skillSessions` | skill | count | distinct sessions with a load, per day; a session spanning midnight counts twice and the window figure is a stated ceiling |
| `skillBlocks` | skill | count | PreToolUse block errors naming it (`skill-not-loaded`, `skill-not-loaded-for-call`) |
| `triggerFires` | skill | `[fired, followed]` | injected trigger contexts naming it; followed when a load of it comes later in the capture |
| `moments` | skill | count | for a `triggered` skill: calls of the tools it names, `Edit`/`Write` calls under the paths it names, owner prompts matching its patterns — the same resolver the hooks use, run over the transcript |
| `toolCalls` | tool | count | every `tool_use` block, sidechains included |
| `guardFires` | rule | `[blocking, advisory]` | the hook's `done exit=2 action-guard <rules>` block text and `advisory action-guard <rules>` lines, both in the transcript |
| `checkFindings` (extended) | rule | `[blocking, advisory, sessions, persisted, relent]` | rendered finding lines (`[SEVERITY] <rule>  <file>`): `persisted` is the advisory pairs still present at the session's last Stop; `relent` the rules in the block before a `loop-guard-relent` |
| `skillCaught` | skill | count | sessions that loaded the skill and were then caught blocking by a check the skill owns |
| `checkTiming` | scope, rule | `[runs, totalMs, maxMs]` | per scope the `Stop: start checks` → `Stop: done` gap on one run id; per rule the runners' timing record: one line after the report, `claudinite-check-timing v1 <scope> total=<ms> <rule>=<ms> …`, the eight slowest rules, rendered and parsed in one module |

The fold already keeps `sessions`, `checks.runs` and `checks.errors`.

### 4.2 Raw — what only a capture can answer, and how far the review goes

Two rules ask whether a skill *should* have loaded in a session where it did not, and several
attach a sample of concrete events. The review reads captures on the logs branch for both, and
stops at a **deterministic digest**: per sampled session, the owner's prompts (first line each),
the tools called with their targets, the files edited, the commands run; per sampled event, the
lines around the mark. Up to five samples per finding, newest first. The judgment — *did this
session's activity fall under the description?* — is not made by the review. It is left to the
reader of the finding, human or agent, who has the digest and the description side by side and
never needs the transcript.

Retention stays the pack's ten-day default: the review runs daily, so the ten days always hold
the sample it wants. A repo that opted into capture-only (`retention_days: 0`) has its digests
recorded as *not sampled*; the rules still evaluate from the fold.

### 4.3 Live — read from the tree, never windowed

- the mounted skill catalog: each skill's estimated tokens (the session summary's estimator),
  its `usage` block, its triggers;
- the active rule catalog (`packRules`): severity, scope, owning skill, and the **prose twin** —
  a `RULES.md` bullet in the same pack naming the rule id in backticks. A twin expressed any
  other way is not seen, and the report counts the rules judged twin-less, because the
  definition is deliberately narrow and a reader weighing the finding needs to know how much
  it missed - on this shelf it sees two twins in ninety-five checks;
- the settings file: `accept` entries and `rules` overrides per rule, barrier `except` entries;
- the pack declaration commits, for the adoption window.

## 5. When it runs, at what scope, and what performs it

| | |
|---|---|
| **Task** | `usage-review`, `packs/claudinite-growth/tasks/usage-review/`, `agent_model: none`, `code_work: node worker.mjs` |
| **Cadence** | daily, after `usage-fold`; precondition: the fold moved since the last review, and the window holds `≥ 10` sessions |
| **Window** | the trailing 28 days: closed ISO weeks from the fold's week rows, the current week from its day rows; compared with the 28 before |
| **Scope** | every subject the repo mounts — its local packs **and** the vendored canon; a finding about a canon subject is evidence the repo cannot act on, and it carries it upward (§6) |
| **Performs** | code, entirely: the evaluator over the rule file, the fold, the live reads, and the digests |
| **Triage** | `usage-triage`, weekly, `agent_model: opus`, the only stage that changes anything; precondition: at least one finding whose `since` is 14 days old with cause `known` or `probable` and no open triage PR for its subject; a `claudinite-canon-curation` task over `packs/` in the canon, the same skill (`triaging-usage-findings`, in `claudinite-growth`) over local packs elsewhere; `expected_outcome: fresh_pr`, automerge `nothing` |
| **Writes** | `.claudinite/local/usage-review.GENERATED.json` — `window` (both windows' bounds and denominators), `notEvaluated` (rule, floor, figure), `unstated` (skills with no `usage` block), `findings` sorted by rule then subject (rule, subject, pack, figures for both windows, cause, sentences, digests, and `since`, the first review date the finding appeared) — delivered by the shared generated-file helper on one accumulating PR, automerge `nothing`, whose body renders the findings as a table per cause confidence; the unchanged-compare ignores the stamp alone, so a day that changes no finding opens nothing |

`since` is what makes a finding's age readable without diffing history, and it is what the
consumers below key on.

## 6. What happens with the results

The review's output is a file that moves when a finding appears, changes or clears. Nothing in
the review acts on it. The proposal for what does:

1. **The dashboard**, first. The growth pack's `dashboard.json` declares a `window` widget —
   findings this window against the previous — and a `list` of the newest findings' subjects
   with their cause confidence. That is where a person sees the review without opening a file,
   and it costs no session and no issue.

2. **An issue per finding that has lasted**, filed by the review itself once a finding's
   `since` is 14 days old and its cause is `known` or `probable`: title
   `Usage: <rule> — <subject>`, label `usage-finding`, body the finding's rendering, one issue
   per (rule, subject), updated in place while the finding persists and **closed by the review**
   the day the finding clears, with the clearing figures in the closing comment. A finding
   with an `unknown` cause never files; it stays in the file and on the dashboard. This is the
   one place a person is asked for attention, and it is asked only for a finding that stayed
   two weeks with a recommendation worth reading. The queue does not pick these up: they carry
   no `task:` marks, so they are a person's inbox, not a run's. Nothing is written into
   provenance at this moment: an issue is a finding, and a finding is not a decision (§7).

3. **Canon evidence, upward.** A finding about a canon skill or check in this repository is
   the canon's business, not the member's. The fleet half is Shepherd's: it sums members'
   review files by (rule, subject),
   with a member count, into a fleet file the canon's own dashboard renders. This repository is
   a member of itself, so its own review file is the first evidence canon curation reads —
   when the owner asks it to, not on a schedule.

4. **The stage that makes the change — agentic, owner-gated.** One task, `usage-triage`, runs
   weekly over the lasting findings (`known` or `probable`, 14 days old) and opens **one PR per
   subject with automerge `nothing`**, carrying the edit itself — the moved lines, the changed
   trigger, the demoted severity — not a description of it. The review changes nothing, the
   triage writes the change, the owner merges or declines it. A proposal is only worth as much
   as the diff it can be read against, and a decline costs a close. Its order is fixed:
   1. read the subject's provenance file first — `Rejected` (was this cause already considered
      and refused), `Source` (what the element was born from, so the proposal undoes no lesson
      it never read), `Mechanism` (why this rung, so a refused rung is not re-proposed without
      new evidence), any entry recording a change already made after an earlier finding on
      this element (a finding that returns after a mitigation is a different case from a first
      one), and `Retire when` (the test the finding may now satisfy);
   2. work the rule's `causes` in order against the finding's figures, digests and samples,
      and name the one it settles on, or the one it adds where the list is `open`;
   3. write the change only where a cause is settled; otherwise comment the finding's issue with
      what it read and what would settle it, and open no PR. Where the change lands, the PR
      carries the element's provenance entry for it in the same diff (§7) — the only provenance
      this design writes.
   In the canon it is a `claudinite-canon-curation` task over `packs/`; in a member the same
   skill runs in `claudinite-growth` over the local packs. It is the one agentic stage of the
   loop and the only writer in it, and its cost is bounded by the gate: a week with no lasting
   finding opens no session.

5. **Existing agentic runs read it, and change nothing because of it.** `growth-extract` and
   the curation sweeps may cite a finding as evidence when they land a lesson they found on
   their own grounds; the review's recommendation is not an instruction to them. That keeps
   the review honest about remedies it was never in a position to test.

What is deliberately **not** proposed: a chain of experiments, or a retrospective per finding.
And nothing anywhere in the loop merges on its own — not the review's own findings file, not the
triage's change. The loop's whole output is two pull requests a person reads: one saying what the
record shows, one saying what it would do about it.

## 7. What reaches provenance

[Provenance](../provenance/DESIGN.md) is the decision log per element, and a usage finding is not
a decision — it is evidence that one may be due. So **the review writes no provenance at all**.
Not for a clean result, not for a finding under its floor, not for a lasting finding, not for one
whose recommendation is never taken. A log that records what was merely noticed is a log nobody
finishes reading, and the review's findings already live in a file, on the dashboard and in an
issue.

The one provenance write in this loop is the ordinary one: when `usage-triage` changes an element,
that edit is a decision, and the forced `changing-pack-elements` skill already owes it an entry in
the existing vocabulary (`trigger-changed`, `moved`, `converted`, `severity-changed`, `weakened`,
…). The entry lands **in the triage's own PR**, so it merges only if the change does — a declined
proposal leaves the element's log untouched, which is the correct record of a decision not taken.
The provenance vocabulary gains no new kind.

What this design adds is what that entry's `Source` must name: the usage rule that produced the
finding, by id, and the finding's issue, by number.

```
- **Source:** usage review rule `skill-forced-only-small`, #<issue> — 31 loads in the 28 days to
  2026-10-03, 30 of them held by a guard; 212 tokens.
```

So a reader tracing a mechanism change backwards lands on the rule that thought so and the figures
it thought it from. The usage rules are elements of the growth pack in their own right — each rule
in `usage-rules.json` has its own file, `packs/claudinite-growth/provenance/<rule id>.md`, born
with the rule and carrying its threshold's reasoning — and a rule whose proposals keep being
declined is visible as one cited by `_declined.md` entries and by nothing else. That is the rule's
own feedback loop, and it needs no observation entries to close.

The growth write-scope rule needs no carve-out: the triage run edits pack elements, which is what
it is scoped to do, and writes the entry beside the change.

## 8. Alternatives, and why not

- **Coded rules** instead of declarations: every threshold would need reading code to know what
  it asserts; the rules are the part a person must be able to review in a sitting.
- **Judging inside the fold**: thresholds would live in the data plane the dashboard and fleet
  read, and a re-examined threshold would rewrite frozen weeks' meaning.
- **An agent phase for the "should it have loaded" judgment**: it spends a session a day on a
  question the digest lets a reader answer in a minute, and the answer only matters once the
  finding has lasted.
- **Acting on findings automatically**, or letting any stage of the loop merge itself: the
  review cannot test its own remedies, and a skill that did not load has several causes of which
  only one is the description; a fix on a guess rewrites content that was right. The owner's
  merge is what proves a rule in this doc was worth writing, so it is also the only thing that
  lets one take effect.
- **No declared expectation**: a count against sessions alone cannot separate seldom-and-healthy
  from never-and-broken, which is the distinction the review exists to draw.
- **A declared RATE** (`loads-per-sessions: 1 in N`), and the rule that divided by it: the
  number is an author's guess, so a finding computed against it reports on the guess rather than
  on the skill, and the record can never contradict it. An expectation earns its place only by
  naming something the record can prove wrong.
- **An issue per finding on first sight**: most findings on a young window are floor noise
  or a single week's weather; two weeks of persistence is what earns attention.
- **Longer retention for the digests**: ten days already covers a daily sample; more raw logs
  buy nothing the rules read.
- **An `observed` kind recording every lasting finding**, whether or not anything came of it:
  the data explosion the provenance design refuses, in its subtler form — not "still fine" daily,
  but a permanent line on an element's log written by a threshold that may itself be wrong, and
  append-only, so a bad rule's residue outlives the rule. The finding's issue and the review file
  carry the observation; only the change carries a log entry.

## 9. Failure modes, stated

- A window under a floor evaluates nothing and says so; *no findings* is a result only when
  `notEvaluated` is empty.
- A counter absent from frozen weeks leaves its rules *not recorded* until enough weeks carry it.
- A capture-only repo gets no digests and says so; the rules still run from the fold.
- A false prose twin recommends an experiment on prose the check does not cover; the
  recommendation says how the experiment is read, and a reader who runs it learns so within a
  window.
- A finding issue whose review stops running stays open with a stale body; the issue names the
  review date it was last confirmed on, so staleness is readable.
- A rule whose signature nothing in the record produces never fires; the retrospective reads
  the per-rule firing history and names it.
- A triage PR left open for weeks holds its subject against a second proposal (the precondition
  excludes a subject with an open PR); a finding that worsens meanwhile shows it on the dashboard
  and in the issue, and the stale PR is closed rather than amended.
- A triage PR merged long after it was written lands a change against figures that have since
  moved; its body carries the window it was written from, and the next review re-judges the
  element on the record as it now is.

## 10. Retrospective brief

Owed once the review has landed in this repository and lived four weeks.

- **Volume.** `sessions ≥ 10` per window here; two to eight findings per review with the floors
  met (zero across two windows means the thresholds are loose, more than twelve means tight);
  read from the review file's history on `main`.
- **Every rule fires at least once in the first two months**, read off the file's history; a
  rule that never fires is re-examined before it is trusted.
- **Issues.** Between one and five `usage-finding` issues open at a time; each closed by the
  review or by a person within a month; read from the label.
- **Acted on.** At least one triage PR merged in the first two months; zero merged out of
  several opened means the recommendations are not worth acting on and the rules are revisited,
  zero opened means the gate is too tight.
- **Expectations declared.** Every canon skill carries a `usage` block within a month (the
  `unstated` list empties); read from the review file.
- **Triage.** One PR per subject and never two open at once; each PR body names the cause
  settled and the provenance fields read; a proposal the owner closes unmerged gets a
  `_declined.md` entry naming the rule, so the next triage does not re-propose it; expected
  one to three proposals a month here, read from PRs titled `Claudinite canon: usage triage`.
- **Provenance.** Entries landed from this loop equal triage PRs **merged**, never more — zero
  on a declined proposal, zero on an element the review only observed; each names its usage rule
  and its finding's issue in `Source`; read by grepping `provenance/` for `usage review rule`.
- **Underuse.** A `known`-cause finding older than 60 days with no citing change; expected zero.
- **Overuse.** Review PRs moving daily with no finding change (a stamp leak); agent-free by
  construction, so no session cost to watch. And the review PR itself left unmerged for weeks —
  it accumulates rather than superseding, so a stale one costs nothing but says the findings are
  going unread.
- **Cost.** The Stop hook's median `stopMs` rises by no more than the timing line's own cost,
  under 5 ms, read from `checkTiming` across the runner change.
- **Cheap to re-examine:** every threshold and floor, the cause of any rule, the window, the
  sample size, the twin definition, the 14-day issue threshold. **Expensive:** the counter
  shapes in the fold header, the `usage` frontmatter vocabulary, the timing line's format. Nothing
  here is expensive to *undo*: no stage of the loop leaves a record behind unless the owner merged
  the change that record describes.
