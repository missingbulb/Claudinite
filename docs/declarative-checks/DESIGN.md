# Declarative checks — the four evaluation moments (design)

The engine is [engine/checks/helpers/pattern-rules.mjs](../../engine/checks/helpers/pattern-rules.mjs);
its vocabulary is documented in that module's header and this document does not repeat it. This
document states the **end state** of the mechanism a rule can be declared against: what a
declaration can read, when it is evaluated, and why that shape over the alternatives. The per-rule
audit that motivates each part — every corpus rule, classified by the moment that could carry it —
is [rule-inventory.md](rule-inventory.md); the review that preceded this design is
[REVIEW.md](REVIEW.md).

## The one idea

A rule is deterministic when its violation has a **signature** something can read without judgment.
The corpus's rules leave their signatures in four different places, and a declaration names which:

| Moment | Signature lives in | Declared as | Evaluated by |
|---|---|---|---|
| **world** | the tree as it stands | no `scope` (the default) | `check_the_world` — the test/CI flow |
| **work** | the change: added and removed lines, changed and untracked files, base-vs-head documents, commits, the reply classes of the session | `scope: "work"` | `check_the_work` — the Stop hook |
| **action** | a tool call's input, before it runs | `scope: "action"` | the PreToolUse hook, and `check_the_work` again over the transcript's tool calls |
| **trigger** | the moment a procedure applies — a tool call, an owner phrase, a tool result | a skill's `force-load-on-*` metadata | the PreToolUse, UserPromptSubmit and PostToolUse hooks |

The first two are checks: a finding is a fact about an artifact. The third is a guard: the finding
is about an action and reaches the agent before the action, so the expensive rework a post-hoc
finding would cause never happens. The fourth is not a check at all — it carries the rules a check
cannot, the procedures and biases, and its only deterministic part is *when they load*. Every rule
in the corpus lands at exactly one of the four, or at prose when it has neither a signature nor a
nameable moment.

The vocabulary is one JSON format across all four (a skill trigger reads the same tool-call
selector an action guard reads), keys read alone to a cold reader, and no key exists ahead of a
rule that needs it — the constraints [REVIEW.md](REVIEW.md) settled and the house rulings behind
them (#707, #789, #799).

## World scope: two passes

A rule about a document's shape reaches neither pass. A required field, a closed value set, a type, a key
set nothing may extend is a property of the JSON Schema the document points at with `$schema`, enforced
for every such document by the engine's `schema-conformance` check and shown by an editor while the
document is written; the declared assertions over parsed fields carry only what a schema cannot state — a
relation between documents, a value that depends on the tree. Anything a schema can enforce is handled
there, and a declared assertion that restates a schema property is one more place for the contract to drift.

Most world rules are "these patterns over these files" — one pass, one file at a time. The rules
the single pass cannot carry share one shape: **something read in one place must agree with, exist
in, or be absent from another place** — a name in prose must be read by code, a path named in a
finding must exist, a stub must equal its canon twin, a pattern a check declares must select at
least one file. Every linter that handles this shape does it the same way: a first phase produces
**named intermediate sets**, and a second phase **quantifies over them** (CodeQL predicates,
Datalog relations, Rego virtual documents, Semgrep's join-mode `refs`, Go analyzers' exported
facts, ArchUnit's `classes that … should …`). The engine adopts that shape and nothing more
general — no recursion, no fixed point: a set derives from files or from sets declared before it,
so evaluation order is the declaration order and termination is by construction.

### Pass one — `extractValueSets`

The existing key, widened from one source to four. An entry names a set and exactly one source:

- `fromParsedFile` / `fromParsedFilesMatching` (+ `whereFileContains`) with `valuesAtFields` — the
  string value at each field path across the selected documents, fanning out over any array along
  the path (`[].scanFiles` reads a root array's entries; `valuesOfArraysAtFields` remains as the
  array-only form).
- `fromLinesMatching` over `inFilesMatching` — the `value` capture group of every line the regex
  hits, in every file the path pattern selects; the other named groups travel with the value.
  Rides the shared scan pass, comment-blind under `scanIgnoringComments` and fence-blind under
  `scanIgnoringMarkdownFences`, so a value mentioned in a comment or a code example is not a fact.
- `fromTrackedPathsMatching` — the `value` group of every tracked path the regex hits, or the
  whole path when there is no group.
- `fromAddedLinesMatching` — `fromLinesMatching` over the change's added lines only; work scope.

Every value carries its **origin** — the file, and the line where a line produced it — because
that is where the finding anchors; a value found twice is one value with its first origin.
`whenSetEmpty` stays declared, never defaulted: `"assertNothing"`, or `{ what, fix }` to report an
empty first phase as a finding at the set's source. The choice exists because the two are
different verdicts and the engine cannot pick one — a knob-name set that is empty means the prose
names no knobs, while an empty set of declared scan patterns means the audit read nothing.

### Pass two — the quantifiers

- `checkSetValues` — for every value of a named set, one assertion: `requireSomeFileMatching:
  { pathMatching, text }` (some in-scope file's text matches the filled template),
  `forbidEveryFileMatching` (none does), `requirePathExists` (the filled path is on disk),
  `requireTrackedPathMatching` (some tracked path matches — with `valueIsPattern: true` when the
  value is itself a regex, the case that lets a declaration audit other declarations). Templates
  interpolate `{value}`, `{path}`, `{line}` and the value's named groups; a value is
  regex-escaped where it fills a pattern unless the entry says it is one.
- `checkSetPairs` — `everyValueOf` one set `mustAlsoBeIn` or `mustNotBeIn` another: the join.
  Two sets meet on value equality, so a join on a key is a derive that captures the key as the
  value (a basename, an id), never a second join vocabulary.
- `requireIdenticalFiles` — `everyFileMatching` must equal the file at `twinAt`, a template over
  `{path}`, `{basename}` and the path pattern's named groups; `whenTwinAbsent` declared. The
  stub-and-canon-copy rule, the local-pack-mirror rule, and any "edit both copies in the same
  commit" rule are this one entry.

Findings anchor at each value's origin, deduped per value and origin, and interpolate the same
variables. A quantifier over a set whose `whenSetEmpty` is `"assertNothing"` asserts nothing;
one over a set declared to flag emptiness has already reported at pass one.

### Evaluation

`results(ctx)` runs three phases per context, still once per run for every declared rule: the
path and parsed sources resolve first; the sweep walks each file once, feeding `matchLines` and
its siblings and the line-derived collectors in the same visit; then the quantifiers run over
the cached reads — each `requireSomeFileMatching` compiles its values into one alternation and
walks the scan set once, so a set of a thousand values costs one more pass, not a thousand.

## Work scope: assertions over the change

The work assertions read what `check_the_work`'s context already holds and no declaration could
reach:

- `forbidAddedLinesMatching` — `{ inFilesMatching, match, unlessLineMatches }`: a line the change
  adds. The dependency-manifest, disclosure-token and reinvented-constant rules are this.
- `requireCoChange` — `{ whenChangedFileMatches | whenAddedLineMatches: { inFilesMatching, match },
  requireChangedFileMatching }`: a change to one thing requires a change to another in the same
  branch — a check added without a test, a permission added without its disclosure, a stub edited
  without its twin.
- `forbidRemovedLinesMatching` — `{ inFilesMatching, match, unlessLineMatches }`: a line the change
  removes, read from the base-vs-head diff. An append-only file (`RULES.md`, a release log) and a
  never-remove-only-empty export are this.
- `flagUntrackedFilesMatching` — a file the run's file set carries that git does not: the new test
  file a green run never executed.
- `whenReplyClassIncludes` — a rule-level gate on the session's declared comment classes (the
  transcript's classification lines), so a work rule can say "on a process change, the diff must
  reach the local packs". Absent transcript, absent assertion.

The two passes apply here too: `fromAddedLinesMatching` derives from the diff, and a quantifier
can relate what the change added in one folder to what it added in another (a brand-new engine
export beside a pack's named import of it).

## Action scope: guards on tool calls

A declaration with `scope: "action"` carries `guardToolCalls`, one entry per shape of call:
`{ tool, inputField, match, unlessMatches, inputFieldAbsent, atMostPerSession, what, fix }`.
`tool` is a name or a regex over names (`/^mcp__github__(list|search)_/`); `inputField` is a dot
path into the tool's input; `inputFieldAbsent` lists fields whose absence is the violation (the
list call with no `fields`); `atMostPerSession` reads the transcript so a guard can say "once".

The same entry is evaluated at two moments. The **PreToolUse hook** evaluates it against the call
about to run: a blocking finding denies the call and hands the agent the finding text; an
advisory one lets the call through and injects the finding as context, so the agent hears the
bias at the moment it applies. **`check_the_work`** evaluates it again over the transcript's
tool-call blocks at Stop, one finding per offending call: the backstop for a member whose hook
did not fire, and the count the usage fold reads to say whether the guard is earning its place.
The severity vocabulary is the check's: a guard that blocks is `blocking`; a bias that should be
heard and may be overruled is `advisory`.

Every per-call hook is a guest in the harness, which reads exit 2 as the one block and prints
any other failure — another exit code, a timeout, stdout that is not JSON — beside the call it
happened on. So the three entries hand one runner (`engine/hooks/hook-runner.mjs`) their event
and a judge; the judge returns a verdict, and the runner alone exits: 0 with one JSON context or
nothing, 2 only for a block on an event that can block. A payload that is not JSON, an engine
module that fails to load, a registry that throws or whose import never settles, a closed
stdout — each ends in exit 0 and a hook-log line, never an error on the call. The advisory
context carries no `permissionDecision`: `allow` would skip the permission prompt for the call,
and an advisory has no business approving anything. What the judges read — the active packs'
triggers and action declarations, with the per-repo `rules` overrides — is derived once and
cached under the OS temp dir behind a stat fingerprint of everything it came from
(`hookContext` in `engine/hooks/hook-context.mjs`), and the transcript is parsed only once a
trigger names the call, so a call no declaration names costs the node start and a cache read.
`dev/tools/hook-latency.mjs` measures each path; the brief below carries the budget.

## Trigger scope: skills that load at a deterministic moment

A skill's frontmatter `metadata` names the moments it must be loaded for, beside the existing
`force-load-on-file-edits-paths`:

- `force-load-on-tool-calls` — `[{ tool, inputMatching }]`: the PreToolUse guard holds the call
  until the skill is loaded, exactly as it holds a file edit today. The procedures around opening
  a pull request, filing an issue, committing, merging, dispatching a workflow and fetching from
  the web each name their call.
- `force-load-on-prompts-matching` — `[regex]`: a UserPromptSubmit hook, on an owner turn the
  pattern hits, injects the instruction to load the skill before acting. The owner's command
  phrases (`LGTM`, `bump version`, `/do-later`) are this.
- `force-load-on-tool-results-matching` — `[{ tool, outputMatching }]`: a PostToolUse hook, on a
  result the pattern hits, injects the same instruction. A `Cannot find module`, a proxy `403`, an
  `EGRESS_BLOCKED`, a build warning are this — the moment a diagnosis rule applies is the moment
  its symptom appears.

Each fires once per session: the transcript's skill loads are the record, so a skill already loaded
is never demanded again, and a procedure that applies ten times a session costs its context once.
The resolver is the one module the path-scoped guard already uses, widened from paths to the three
selectors, so the hook and the Stop-time `skill-loaded-before-editing` rule cannot disagree about
what a moment demands.

What this changes for the prose: a rule that starts "when opening a PR", "when filing an issue",
"when committing", "when waiting on CI" has a nameable trigger, and its home is the skill that
trigger loads — grouped with every other rule sharing the trigger, so one load carries the whole
procedure. `RULES.md` keeps what has no trigger: the judgments a session must carry throughout.

## What stays prose, and the rung that is not built

A rule with no signature in any of the four places stays prose: naming quality, problem-first
consensus, sizing writing to its idea, most of the fleet-operation lessons. The harness offers a
fifth rung for these — hooks of type `prompt` or `agent`, an LLM judging the transcript or the
diff at Stop — and this design does not take it. Its drawbacks are the ones the deterministic
layer exists to avoid: the verdict is not reproducible, so a fixture cannot prove it; every Stop
pays a model call whether or not the rule is in play; and a judge's firing history says nothing
about whether the rule was followed or the judge was lenient. It stays a documented option for a
rule whose cost of violation is high and whose signature is genuinely absent, to be tried against
a real run before it is offered as a rung.

## Alternatives considered

- **A general query language over the tree** (JSONPath selectors, a Datalog or Rego subset,
  ast-grep's composition algebra). Every cross-file rule becomes expressible, and every
  declaration becomes unreadable to a cold reader: the house rule that a key must read alone is
  what keeps a pack's declarations reviewable by whoever adopts the pack, and a query language
  trades that for generality nothing in the inventory needs. Named sets plus a closed quantifier
  set covers the inventory's cross-file rules; the composition vocabulary stays the growth path
  when a real rule needs it.
- **Coded rules for every cross-file case.** The status quo. Each costs a module, a test and a
  pack manifest line, so a member's local pack can carry one only with engine-shaped code beside
  it, and the fifty-odd imperative rules are where the corpus's cross-file logic sits unread. The
  two-pass vocabulary is what lets the next such rule be data.
- **Semgrep-style join reporting** — one finding at the last matching location. Rejected: a
  finding a session can act on names the origin of the value that failed, so every value carries
  its origin and every finding anchors there.
- **Action guards as hand-written hook code** (the remote-branch-delete guard's shape). Each new
  guard would be an engine change shipped on the engine lane; as declarations they ship with the
  pack that owns the rule, on the pack lane, and members' own local packs can declare them.
- **Guards only at PreToolUse, or only at Stop.** Hook-only leaves no record a metric can read and
  no backstop for a member whose settings never wired the hook; Stop-only catches the mistake
  after the rework it caused. One declaration, both moments.
- **Skill triggers as the harness's own `paths` frontmatter.** That field limits when a skill is
  offered, never forces a load, and has no tool-call or prompt form; the corpus's `metadata` keys
  are acted on by the corpus's own hooks and stay inert to the harness.
- **An LLM judge as the rung for judgment rules** — above.

## Retrospective brief

The element earns the review [production-retrospective](../../packs/basics/skills/production-retrospective/SKILL.md)
defines, once it has lived a week in production. The expectations the review reads against:

- **Conversions.** The inventory's convertible classes shrink: each prose-to-checks sweep after
  the mechanism lands converts rules from the A, B, C and D classes rather than logging them as
  un-checkable — expected at least three conversions per sweep for the first month, measured by
  the sweep PRs' declared-check diffs.
- **Schema rung in use.** No `checkParsedFiles` entry added after the mechanism lands restates a
  property a schema could carry; measured by reading each sweep PR's added entries against the schemas
  the same documents point at.
- **Two-pass rules in use.** At least five declarations carry `checkSetValues`, `checkSetPairs`
  or `requireIdenticalFiles` a month in, at least one of them in a member's local pack; measured
  by grepping the mounts' `declared-checks.json` files.
- **Guards firing.** Each action guard's firing count, per the usage fold: a guard that never
  fires in a month is a demotion candidate (the rule may already be followed), and one that
  fires on most sessions and is overruled each time is mis-scoped.
- **Skill loads by trigger.** The usage fold's skill-load counts, split by which trigger loaded
  them: a tool-call trigger that loads a skill in most sessions where its call happens is
  working; a prompt trigger that never fires is mis-patterned.
- **Misuse.** A declaration whose set derives from the whole tree and quantifies with a
  file-wide `requireSomeFileMatching` on a large repo shows up as the slowest declared rule in the
  run's timing; a guard declared `blocking` for a bias rather than a defect shows up as repeated
  overrules in the transcript.
- **Hook cost.** Each per-call hook on a call no declaration names, measured by
  `node dev/tools/hook-latency.mjs` at HEAD on the runner class the recorded table came from (this
  sandbox, 2026-09-05: PreToolUse ~88 ms, PostToolUse ~80 ms, UserPromptSubmit ~80 ms; a guarded
  call parsing a 5 MB transcript ~165 ms; before the runner and the cache, ~185 ms, ~172 ms and
  ~172 ms, and ~250 ms with that transcript): expected within a quarter of the recorded figures,
  and a registry miss (`registry-loaded` in the hook log) once per session rather than per call —
  a hook that keeps re-deriving means the fingerprint reads something that moves on every call.
- **Hook health.** Zero `hook_non_blocking_error` attachments naming a Claudinite hook and no
  exit code but 0 and 2 for one, across the window's captured transcripts on `conversation-logs`
  (the hook log is per machine, so the transcripts are the durable record); where a session's
  own `.claudinite-hooks.log` is at hand, its `done exit=0 deadline` and `hook-failed` lines name
  what failed open and how often.
- **Cheap to re-examine:** the once-per-session trigger semantics, the advisory-vs-blocking
  default for guards, which operation skills exist. **Expensive:** the four-moment split itself
  and the named-set vocabulary, which member declarations will carry.
