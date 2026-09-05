# Rule inventory — every corpus rule, by the moment that could carry it

Companion to [DESIGN.md](DESIGN.md): the audit behind the four evaluation moments. Every bullet
of every pack's `RULES.md` — the canon packs and the home's own local pack — is one row,
classified by the deterministic mechanism that could carry it and by what that mechanism still
lacks. The `prose-to-checks` sweep reads this as its worklist: an **A** row converts with the
vocabulary as it stands; a **B**, **C**, **D** or **E** row names the key it waits on; an **F**
row names the trigger the rule's skill should load on.

The classes:

| Class | The signature lives in | Carried by |
|---|---|---|
| **A** | the tree, readable in one pass over one file at a time | a declared check with today's vocabulary |
| **B** | the tree, across files — a set derived first, then quantified over | a declared check with the two-pass keys |
| **C** | the change — added or removed lines, changed or untracked files, base-vs-head | a declared work-scope check |
| **D** | a tool call's input, before it runs | a declared action guard |
| **E** | the session transcript — a reply's shape, a call sequence or count | a transcript assertion |
| **F** | no signature, but a nameable moment — a tool call, a phrase, a path, a result | a skill loaded by that trigger |
| **G** | nowhere: judgment or knowledge with no moment beyond the pack's subject | prose |
| **H** | a requirement or platform setting mis-homed in a pack | re-home; never convert |
| **X** | already carried by a check, hook or test the row names | nothing |

A row's class is a first reading by a session, not a verdict: "(weak)" marks a signature that
needs a false-positive pass against real trees before it ships, and a row a sweep finds to be
mis-read is corrected here, dated, rather than argued with. Counts are of numbered rows.

## Totals

| Pack | rows | A | B | C | D | E | F | G | H | X |
|---|---|---|---|---|---|---|---|---|---|---|
| basics | 64 | 3 | 0 | 3 | 11 | 3 | 17 | 19 | 0 | 8 |
| local/claudinite | 166 | 18 | 8 | 4 | 16 | 4 | 16 | 89 | 0 | 11 |
| research-project | 56 | 19 | 10 | 9 | 1 | 6 | 6 | 5 | 0 | 0 |
| web-scraping | 27 | 13 | 6 | 3 | 1 | 1 | 1 | 2 | 0 | 0 |
| headless-browser | 21 | 16 | 1 | 0 | 2 | 0 | 1 | 1 | 0 | 0 |
| executable-requirements | 28 | 14 | 8 | 0 | 1 | 0 | 2 | 1 | 2 | 0 |
| spec-driven-product | 26 | 6 | 7 | 3 | 2 | 1 | 2 | 3 | 1 | 1 |
| chrome-extension | 24 | 15 | 4 | 0 | 0 | 0 | 1 | 3 | 0 | 1 |
| macos | 33 | 27 | 1 | 0 | 0 | 1 | 0 | 1 | 1 | 2 |
| flutter | 15 | 11 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| firebase | 18 | 16 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| node | 5 | 3 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| web-speech | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| html | 4 | 1 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| static-website | 8 | 2 | 1 | 1 | 0 | 0 | 1 | 2 | 0 | 1 |
| product-wiki | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| leaflet | 4 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| python | 3 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| aws-sam | 13 | 4 | 1 | 1 | 1 | 1 | 0 | 2 | 1 | 2 |
| claudinite-fleet-sheepdog | 12 | 0 | 0 | 0 | 0 | 2 | 8 | 0 | 1 | 1 |
| claudinite-lifecycle | 8 | 0 | 0 | 0 | 2 | 1 | 2 | 1 | 0 | 2 |
| claudinite-growth | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| claude-code-web-users-support | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2 |
| **all** | **557** | **187** | **51** | **26** | **38** | **23** | **61** | **131** | **6** | **34** |

## What the mechanism lacks, by how many rows wait on it

- **Nothing — the sweep.** 187 rows convert with the vocabulary as it stands. The
  technology packs are where they sit (`macos`, `firebase`, `web-speech`, `headless-browser`,
  `chrome-extension`, `research-project`): prose written before the declarative engine existed,
  never swept. The bottleneck is the conversion sweep's throughput, not the engine.
- **Skill triggers beyond file edits** — 61 rows. Tool-call triggers dominate (opening a PR,
  filing an issue, committing, merging, dispatching a workflow, fetching from the web), then
  owner-phrase triggers and tool-result triggers.
- **Two-pass derive → assert** — 51 rows: a value captured in one place must appear, resolve
  or be absent elsewhere; two files must agree; a declared pattern must select something.
- **Action guards** — 38 rows: Bash command shapes (`git pull`, `git merge origin/main`,
  `sleep`, `pkill -f`, `| tail`, `node --test` in the wrong form, `curl api.github.com`),
  GitHub MCP arguments (a PR body without its closing line, a list call without `fields`), and
  file tools aimed at a generated or vendored path.
- **Work-scope keys** — 26 rows: a line the change adds or removes, a file changed without
  its sibling, an untracked file a green run never covered.
- **Transcript assertions** — 23 rows: a reply's shape after a given owner turn, a repeated
  or misordered tool call, a wait that never named its condition.
- **Prose** — 131 rows stay: 89 of them the home's own operational
  lessons, the rest judgment with no moment to hang on.
- **Re-home** — 6 rows are product statements or platform settings inside a pack.
- **Already carried** — 34 rows name the check that covers them and can be deleted by the
  deletion test.

## The rows

## basics — `packs/basics/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|---|---|---|---|
| 1 | Starting any requested change (problem-first) | F | first owner turn that requests a change — UserPromptSubmit | prompt-triggered skill |
| 2 | Replying to an owner comment (classification line) | E | reply after each owner turn carries `Comment class:` line | transcript assertion `eachOwnerTurnReplyMatches` |
| 3 | Acting on a correction | F | reply classified `correction` | class-triggered guidance (transcript) |
| 4 | Acting on a feature (requirements doc, failing test first) | X | `feature-requirements-first` where executable-requirements is active | none |
| 5 | Acting on a process change (land as local-pack rules) | C | reply classified `process-change` and diff touches no `.claudinite/local/packs/**` | work: `whenReplyClassIncludes` + `requireChangedFileMatching` |
| 6 | Choosing what goes on the ladder | F | editing `RULES.md`/`declared-checks.json` (path-scoped `writing-pack-prose`) | none |
| 7 | Landing a rule on the ladder (assurance first, see it fail) | C | diff adds a check (declared entry or rule module) and touches no test file | work: `whenAddedLinesMatch` in file set → `requireChangedFileMatching` (co-change) |
| 8 | Building a mechanism (verify not already provided) | G | — | — |
| 9 | Building release/deploy/CI plumbing | F | Edit/Write under `.github/workflows/**`, `dev/**` release scripts | path-scoped skill |
| 10 | Finishing a change — watch it work now | G | — | — |
| 11 | Changing scheduled or unattended machinery — force a run | F | Edit of `tasks/*/task.json`, `worker.mjs`, `.github/workflows/*.yml` | path-scoped skill (writing-tasks widened) |
| 12 | Planning a migration | F | Write of `docs/*/DESIGN.md` (writing-migration-plans) | path-scoped force-load |
| 13 | Adding a legacy tolerance — advisory + removal link | A | `@legacy-tolerance advisory:<id> retire:#<n>` line above the declaration (local rule 68 carries the marker) | none in canon (home check exists) |
| 14 | Choosing an automerge policy | X | `automerge-policy-scope` | none |
| 15 | Predicting a data-deleting change — policy `nothing` | G | — | — |
| 16 | Handing over a wide diff — say so | D | `mcp__github__create_pull_request` whose branch diff spans > N top-level folders and body names none | action guard with a computed diff fact |
| 17 | Verifying now is impossible — verify-in-production | F | after `merge_pull_request` (merge-to-main already steps into it) | none |
| 18 | Finishing a larger element — retrospective | F | merge of a PR touching `docs/*/DESIGN.md` | tool-call-triggered skill |
| 19 | Feedback flagging a misunderstanding | G | — | — |
| 20 | Writing anything — size to its idea | G | — | — |
| 21 | Correcting an artifact against a source | G | — | — |
| 22 | Acting on an approval — backward only | E | owner turn `LGTM` followed by later edits then a merge with no second approval | transcript sequence assertion (hard) |
| 23 | `ToolSearch` with a bare name | D | `ToolSearch` query not in `select:` form naming a known MCP short name | action guard on tool input |
| 24 | `Edit` without a prior `Read` | X | the harness rejects it | none |
| 25 | `Grep` context flag without `output_mode: content` | D | `Grep` input has `-A/-B/-C` and no `output_mode` | action guard |
| 26 | Exact text from the web — curl into scratchpad | F | `WebFetch` call | tool-call-triggered guidance |
| 27 | Sandbox/proxy denial is a policy boundary | F | tool result containing `403`/`EGRESS_BLOCKED` | PostToolUse-triggered guidance |
| 28 | Scheduling a wake-up — pass `prompt` | D | `ScheduleWakeup` input without `prompt` and not `stop` | action guard |
| 29 | Seeing a warning — fix it | F | Bash result matching `warning` | PostToolUse-triggered guidance |
| 30 | Suppressing a warning — reason at site | X | `warning-suppression` | none |
| 31 | Waiving a finding on text | F | Edit of `.claudinite-settings.json` `accept` | path-scoped guidance |
| 32 | Working around a vendored-check finding | F | same trigger as 31 | — |
| 33 | Deferring a warning — dedicated issue, search by identifier | F | `mcp__github__issue_write` create | tool-call-triggered skill |
| 34 | Create an issue before work | X | `task-lifecycle` | none |
| 35 | Branch + issue in commits | X | `task-lifecycle` | none |
| 36 | PR body `Closes #N` on its own line | D | `mcp__github__create_pull_request` body lacks `^Closes #\d+$` | action guard (block) + transcript backstop |
| 37 | Update the issue as work progresses | G | — | — |
| 38 | Spotting a change that should wait — do-later | F | prompt phrase `/do-later`, `after this lands` | prompt-triggered skill |
| 39 | Filing into the ad-hoc queue — only doable work | D | `issue_write` body with the queue marker naming another repo or a console | action guard (advisory) |
| 40 | Filing an issue under another — sub-issue | D | `issue_write` create body says `phase of #N`/`follow-up` with no `parent_issue_number` | action guard (advisory) |
| 41 | Handing over a human-only step — own issue | F | `issue_write` body containing `- [ ]` | tool-arg-triggered skill (writing-handover-issues) |
| 42 | Naming for scope, not technology | G | — | — |
| 43 | Shared constant + drift guard | X | `shared-constants` (partial) | none |
| 44 | A says what it needs from B, not how | G | — | — |
| 45 | One concern per commit | D | Bash `git commit` message with numbered items | action guard (advisory) |
| 46 | GENERATED file — never hand-edit | D | Edit/Write on a `*GENERATED*` path | action guard (block); `generated-merge-driver` covers the merge half |
| 47 | Verify platform behaviour against a real run | G | — | — |
| 48 | Optimising — prove behaviour preserved | G | — | — |
| 49 | Earn each dependency | X/C | `node/earn-each-dependency` (node only); generic: added manifest dependency line | work: `forbidAddedLinesMatching` per manifest class |
| 50 | Edge case a review raised — regression test | G | — | — |
| 51 | Documenting a procedure — only what docs lack | G | — | — |
| 52 | Code that can silently do nothing | A | `catch {}` / `catch (e) {}` with an empty body and no comment | `matchLines` + `unlessIndentedBlockBelowMatches` (advisory) |
| 53 | Persisting on a user's machine | G | — | — |
| 54 | Changing what software does with user data — disclosure in the same commit | C | added lines matching permission/listener/fetch tokens and no change to `PRIVACY*`/policy files | work co-change assertion |
| 55 | Driving an external runtime more than once — one driver | E | > N Bash calls with inline `node -e`/`python -c` against one target | transcript count assertion |
| 56 | Automating what needs conversation context | G | — | — |
| 57 | Exit path of a pipeline step | G | — | — |
| 58 | Piping through `tail`/`head` | D | Bash command ending in `\| (tail\|head)` | action guard (advisory) |
| 59 | `pkill -f` pattern | D | Bash `pkill -f` with an unbracketed pattern | action guard |
| 60 | Fresh checkout — `cd` in; install first | F | Bash result `Cannot find module` | PostToolUse-triggered guidance |
| 61 | Config value — no default | G | — | — |
| 62 | Unknown is a state | G | — | — |
| 63 | Writing a repo-scanning check — `git ls-files`, strip comments | A/F | rule module under `*Rules/` using `readdirSync`/`walk` or a fresh comment-stripper | `matchLines` (advisory) + path-scoped skill |
| 64 | Writing a comment — why, not the edit | G | `improve-comments` covers the sweep | — |

## local/claudinite — `.claudinite/local/packs/claudinite/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|---|---|---|---|
| 1 | Rule about what `packs/` may reference → barriers | G | — | — |
| 2 | Writing `docs/<initiative>/DESIGN.md` — end state only | A/F | headings like `## Migration`/`## Status`/`## Request` in `docs/*/DESIGN.md`; Write of that path | `matchLines` (advisory) + path-scoped force-load |
| 3 | Migration plan is the issue, never `MIGRATION.md` | A | a tracked `docs/**/MIGRATION.md` | `forbidPaths` (path-only forbid) |
| 4 | Built design doc — delete whole | F | merge completing a design-doc'd element | tool-call-triggered skill |
| 5 | Sweeping a deleted doc's `§` pointers | B | set of `§N` pointers naming a doc → each resolves | derive captures → assert resolves |
| 6 | Ending a session on unfinished work — issue, no hand-off prompt | E | Stop with an open branch and no `issue_write`/`add_issue_comment` in the session | transcript tool-call assertion |
| 7 | Cross-repo `Verify:` parks | D | `issue_write` body `Verify:` naming another repo | action guard (advisory) |
| 8 | No repo list in canon code | A | literal `missingbulb/<name>` in `engine/**`, `packs/**` code | `matchLines` with excludes |
| 9 | Derived fleet artifact — PR not commit | G | — | — |
| 10 | Value right for nearly every project — no adoption question | F | Edit of `pack.mjs` `questions` | path-scoped guidance |
| 11 | Member platform setting — last resort | G | — | — |
| 12 | Credential nothing weaker replaces — report missing | G | — | — |
| 13 | Change to what members receive — force delivery when | F | merge of a PR touching `engine/**` | tool-call-triggered skill |
| 14 | Forcing fleet delivery — follow, report | F | `actions_run_trigger` of `fleet-baseline` | tool-call-triggered guidance |
| 15 | Retiring a field — `@deprecated` | G | — | — |
| 16 | Config validation — JSON Schema | G | — | — |
| 17 | Sharing logic between sibling packs | X | `pack-independence`, `claudinite-isolation` | none |
| 18 | Report-card number — window vs window | G | — | — |
| 19 | Lacking a report-card field | G | — | — |
| 20 | Windowing a count | G | — | — |
| 21 | Classifying by derivation from live state | G | — | — |
| 22 | Scheduling a tolerance's removal — convergence window | G | — | — |
| 23 | "why did it fail?" — lead with `file:line` | E | owner turn matching `why did .* fail` whose reply carries no `\S+\.\w+:\d+` | transcript pair assertion |
| 24 | Reaching for `AskUserQuestion` | D | `AskUserQuestion` call | action guard (advisory, injects the cost) |
| 25 | Re-posting a declined question | E | two `AskUserQuestion` calls with overlapping text | transcript count assertion |
| 26 | Vague destructive instruction — scope the noun | G | — | — |
| 27 | Asked to generalise/review — land the conversions | G | — | — |
| 28 | `Claude_Code_Remote` — one call per intent | D/E | second `mcp__Claude_Code_Remote__*` call with identical input | action guard (transcript-aware) |
| 29 | Public sibling repo — `git clone` | D | `add_repo` for a public repo | action guard (advisory) |
| 30 | Issues across repos — `add_repo` | G | — | — |
| 31 | Waiting — guard names the condition; no padded sleep | D | Bash `sleep N` standalone or trailing `; sleep` | action guard |
| 32 | Waiting on CI — MCP check runs; sandbox blocks `api.github.com` | D | Bash `curl .*api.github.com`, `gh ` | action guard (block) |
| 33 | `mcp__github__*` list/search without `fields`/`per_page` | D | `mcp__github__(list\|search)_*` input lacking both | action guard |
| 34 | Re-waiting on a signal that failed | G | — | — |
| 35 | Human step in an issue — deepest URL | F | `issue_write` body with `- [ ]` | tool-arg-triggered skill |
| 36 | Reply to a multi-claim comment | G | — | — |
| 37 | Repeating a design doc's rationale | G | — | — |
| 38 | Owner reversing a standing decision | G | — | — |
| 39 | Screenshot from a scratch harness — say so | D | `SendUserFile` with an image under the scratchpad | action guard (advisory) |
| 40 | Bash `cd` outside the project root | X | the harness reports the reset | none |
| 41 | Asserting why a system behaved — primary evidence | G | — | — |
| 42 | `RULES.md` that describes rather than instructs | A | top-level bullet not in `**trigger** —` form | `matchLines` form check (advisory) |
| 43 | Whether a line earns its place | G | — | — |
| 44 | Deferred direction → `docs/` | G | — | — |
| 45 | Naming a canon pack — kebab-case | A | a `packs/<dir>` whose name is not `^[a-z0-9-]+$` | `forbidPaths`/path-name assertion |
| 46 | `claudinite-` prefix for Claudinite-feature packs | G | subject is a judgment | — |
| 47 | New Claudinite-facing capability — pick the distribution model | F | Write of a new file under `engine/` or a new `packs/<dir>/` | path-scoped (new-file) guidance |
| 48 | Skill not mounted — read it from the tree | G | — | — |
| 49 | Adding/changing a check — catalog row; re-run against main | X/C | `catalog-completeness`; the re-run is merge-to-main's | none |
| 50 | Never state how many checks/rules | A | `\b\d+ (checks\|rules)\b` in `*.md` outside GENERATED/VERSIONS | `matchLines` (advisory) |
| 51 | A check's `fix` text matches its severity | A | advisory entries whose `fix` says `accept`/`config` | `checkParsedFiles` over a root array |
| 52 | Naming a spec key | G | — | — |
| 53 | Legacy tolerance marker | X | home rule 68 | none |
| 54 | No prose in a declaration | A | `description`/comment key in a `declared-checks.json` entry | `checkParsedFiles` over a root array (`forbidField`) |
| 55 | Transcript checks screen pseudo-turns | G | — | — |
| 56 | Fixturing a Stop-hook check | F | Edit of a work-rule test | path-scoped guidance |
| 57 | Doc reached only via a `RULES.md` link → skill | B | links out of `RULES.md` → each target is a `SKILL.md`/README | derive links → assert path shape |
| 58 | Moving a file a `doc:` points at | X | `reference-integrity` | none |
| 59 | Missing-thing check gated on its own signal | G | — | — |
| 60 | Whether an enforced check earns its keep | G | usage metrics | — |
| 61 | Procedure re-derived every run → script | G | — | — |
| 62 | Create the artifact a check demands first | G | — | — |
| 63 | Canon prose naming a home-only local pack path | A | `.claudinite/local/packs/` in `packs/**/*.md` | `matchLines` |
| 64 | Editing scheduler/executor yml — thin | X | `scheduler-workflow-shape` | none |
| 65 | Moving a scheduler program out — both copies same commit | B | pair (stub in `.github/workflows/`, canon copy) → equal | `requireEqualFiles` (join by basename) |
| 66 | Path/regex against the mount — two-root form | A | literal `.claudinite/shared/` outside an optional group | `matchLines` (advisory) |
| 67 | Module under `packs/` — no top-level await | X | `pack-discovery-entry-await` | none |
| 68 | Tightening a member-file contract | G | — | — |
| 69 | Adding a `SPEC_KEYS` key | F | Edit of `pattern-rules.mjs` | path-scoped guidance |
| 70 | Stale member declaration — fail the run | G | — | — |
| 71 | Renaming a pack whose config members write | F | Edit of `renamed-packs.mjs` | path-scoped guidance |
| 72 | `author_association` never | A | `author_association` in code | `matchLines` |
| 73 | Extending a copied stub's reads | F | Edit of `.github/workflows/claudinite-*.yml` | path-scoped guidance |
| 74 | Migration record needing newer engine | F | Write under `engine/migrations/<new>/` | path-scoped guidance |
| 75 | `updates/*` export — empty, never remove | C | a removed `export` line in `updates/*.mjs` | work: `forbidRemovedLinesMatching` |
| 76 | Retiring an emptied export | G | — | — |
| 77 | Renaming an `engine/` module `packs/` imports — shim | X/C | `reference-integrity` | none |
| 78 | Pack consuming a brand-new engine export — namespace import | C | set of exports added to `engine/**` in this diff → no added named import of them under `packs/` | work two-pass: derive from added lines, assert over added lines |
| 79 | A pack that fails to load | G | — | — |
| 80 | Which imported symbols are fielded | G | — | — |
| 81 | Changing a vendored stub — canon's copy in the same commit | B | pairs by basename (`vendoring/**/x.yml`, `.github/workflows/x.yml`) → equal | `requireEqualFiles` |
| 82 | Excluding files from the vendor set | F | Edit under `vendoring/` | path-scoped guidance |
| 83 | Testing an operational file vendors | G | — | — |
| 84 | Retiring a protocol — sweep outside | G | — | — |
| 85 | API write — read status | G | — | — |
| 86 | Fleet delivery — stamps | G | — | — |
| 87 | One timeout bound covering two waits | G | — | — |
| 88 | Give-up message for a timeout | G | — | — |
| 89 | Size-capped API field — two tiers | G | — | — |
| 90 | Generated title scaling with a list | G | — | — |
| 91 | Preflighting a grant | G | — | — |
| 92 | Finer classification of a catch-all | G | — | — |
| 93 | Adding a fleet task — fail loudly | F | Write of a new `tasks/<name>/` in the fleet pack | path-scoped guidance |
| 94 | Spawning a child process — explicit `cwd` | A | `spawn(Sync)?\(` under `tasks/**` with no `cwd` in its block | `matchLines` + `unlessIndentedBlockBelowMatches` |
| 95 | Worker crash vs nothing-to-run | G | — | — |
| 96 | Member maintenance PR won't land | G | — | — |
| 97 | Uniform fleet signal — rate limit first | G | — | — |
| 98 | Corroborating with an unreliable signal | G | — | — |
| 99 | Retiring a parameter channel — fail loudly | G | — | — |
| 100 | `GITHUB_TOKEN` push fires no workflow | G | — | — |
| 101 | Workflow referencing a renamed entry point | X | `reference-integrity` | none |
| 102 | Script written for one context | G | — | — |
| 103 | Check watching one of two surfaces | G | — | — |
| 104 | Date-encoded identifier rollover | A | `% 10` on a year expression | `matchLines` |
| 105 | Dotted version stays a string | A | `parseFloat(`/`Number(` applied to a `version` | `matchLines` (advisory) |
| 106 | Text instructing a model to echo | G | — | — |
| 107 | Stacked-PR bump verification | G | — | — |
| 108 | Queue item's PR — never `Closes #<own issue>` | D | `create_pull_request` body `Closes #N` where N is the item's issue (branch-derived) | action guard with a computed fact |
| 109 | Task cadence | G | — | — |
| 110 | Nightly-firing precondition | G | — | — |
| 111 | After a scheduler flip — re-audit | G | — | — |
| 112 | Precondition gates on movement | X/F | `writing-tasks` force-loads on `task.json` | none |
| 113 | Signal true most days — widen only | G | — | — |
| 114 | Verdict relative to a set | G | — | — |
| 115 | Regenerated-file task lands via `deliver-generated.mjs` | A | worker naming `GENERATED` with no `deliver-generated` import | `checkEachFile` |
| 116 | Worker leaving a checkout behind | A | `git checkout`/`git switch` in a worker | `matchLines` (advisory) |
| 117 | Exercising a task Action-side | G | — | — |
| 118 | Converging a run — next action | G | — | — |
| 119 | `outcome:done` while a PR is live | D | `issue_write` adding `outcome:done` with an open PR this session | action guard (transcript-aware) |
| 120 | Decomposing a pipeline | G | — | — |
| 121 | `on_interrupt: needs-human` | G | — | — |
| 122 | Verdict out of a killable subprocess | G | — | — |
| 123 | Repair rule over a live collection | G | — | — |
| 124 | Must-act-again-later | G | — | — |
| 125 | Dedup keyed on the target | G | — | — |
| 126 | Converging a work item — `converge-item.mjs` | F | `issue_write` with an `outcome:` label | tool-arg-triggered guidance |
| 127 | Testing a task's triggering | F | Edit of `task.json` `frequency` | path-scoped guidance |
| 128 | Testing a fail-soft step | G | — | — |
| 129 | Path-pattern check whose scope is empty | B | set of every declared `scanFiles` regex → some tracked path matches each | derive from parsed JSON → assert over tracked paths (meta-check) |
| 130 | Directory named in a finding/remedy — exists | B | path-like tokens in `what`/`fix`/`failureMessage` → each resolves | derive captures → assert path exists |
| 131 | Helper reapplied twice | G | — | — |
| 132 | Identity-arbitrated mechanism | G | — | — |
| 133 | Simulator models writes | G | — | — |
| 134 | Mid-run invariant | G | — | — |
| 135 | Policy test asserting a literal sentence | A | long quoted prose inside an `assert` in a test | `matchLines` (advisory) |
| 136 | History-walking test guards shallow clones | A | test file with `git log`/`rev-list` and no shallow guard | `checkEachFile` |
| 137 | Restoring after a see-it-fail mutation | G | — | — |
| 138 | Mutating with uncommitted work | D | Bash `git checkout --` with a dirty tree | action guard (advisory) |
| 139 | Running the suite — the one command | D | Bash `node --test` not in the `git ls-files` form | action guard (advisory, carries the command) |
| 140 | Re-slicing a suite run | E | repeated `node --test` calls | transcript count assertion |
| 141 | Green run covering an untracked test | C | untracked `*.test.mjs` at Stop | work: `untracked` file set |
| 142 | Iterating on a sweep — touched tests only | G | — | — |
| 143 | Surveying by reading | G | — | — |
| 144 | Named knob — code reads and writes it | B | backticked `SCREAMING_CASE` names in prose → each appears in code | derive captures → assert `someTrackedFileContains {value}` |
| 145 | Deleting a writer | G | — | — |
| 146 | Renaming an entity | X | `reference-integrity` | none |
| 147 | Retired constant reinvented mid-migration | B | retired names from migration records → absent in code | derive from parsed/markdown → assert absent |
| 148 | Renaming stored data — decode side | G | — | — |
| 149 | Second rename — straight map | G | — | — |
| 150 | Coverage marker after the effect | G | — | — |
| 151 | Bulk move preserved content | G | — | — |
| 152 | Probe commit — `git commit -am` | D | Bash `git commit -a` | action guard (advisory) |
| 153 | Editing JSON config as anchored text | D | Bash/`node -e` that `JSON.stringify`s back into a settings file | action guard (advisory) |
| 154 | JSON target inside an array | G | — | — |
| 155 | Returning to a branch that waited | G | — | — |
| 156 | Re-verify on moved main — rebase never merge | D | Bash `git merge origin/main` | action guard (block); `squash-merge-history` is the backstop |
| 157 | Merging a long-open PR — `mergeable_state` | F | `merge_pull_request` | tool-call-triggered (merge-to-main) |
| 158 | After squash-merge — prune | G | — | — |
| 159 | `RULES.md` is append-only | C | removed lines in a `RULES.md` | work: `forbidRemovedLinesIn` |
| 160 | Syncing local main — fetch + reset | D | Bash `git pull` | action guard (block) |
| 161 | Merge skill by target repo | G | — | — |
| 162 | Work completing an open PR — its branch | G | — | — |
| 163 | Combining two PRs | G | — | — |
| 164 | "should no X decide this?" | G | — | — |
| 165 | Retry across an unobservable call | G | — | — |
| 166 | Regex import-path rewriter | G | — | — |

## research-project — `packs/research-project/RULES.md`

Rows `1`–`56` are the bold-led bullets in file order — the same 56 rows, same order, as the README's rule index. The file also carries rule-bearing items that are not bold bullets; they are interleaved in file order as `s1`–`s6` (the core loop's numbered steps), `u1`–`u6` (unbolded bullets) and `p1`–`p5` (standalone paragraphs: metric identity, calibration ×2, §12, §14).

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|---|---|---|---|
| s1 | Reproduce & diagnose visually first; measure, don't guess | E | first tracked-source Edit not preceded by an image Read or a scratchpad diagnostic run | transcript tool-call sequence vocabulary |
| s2 | Prototype in the scratchpad; don't touch tracked code yet | D | Edit/Write on a tracked source path while the session has no prior Write or run under the scratchpad dir | file-tool guard with transcript precondition |
| s3 | Show a rendered [original / result] comparison inline; picture leads | E | after a tracked-source edit, no image Read (png/jpg) precedes the reply's first numeric table | reply image-block / Read-of-image reader |
| s4 | Get a read; ask one targeted question | E | more than one AskUserQuestion between two owner turns; question of confirm-shape ("shall I proceed") | tool-call count per owner turn |
| s5 | Wire it in fully — see Definition of done | G | pointer to rows 25–29; no content of its own | none |
| s6 | Record a numbered iteration note | C | pipeline source changed ∧ the notes doc (file holding `## R<n>` sections) unchanged | work key: changed-X-requires-changed-Y |
| u1 | Every change presented as a rendered comparison; results figure over metrics wall | E | dup of s3 | same as s3 |
| u2 | Presentation render ≠ debug overlay; matched colours; id tags | F | Edit/Write of a render/overlay script (`**/render*`, `**/overlay*`, `**/figure*`) → render-results skill | path-scoped force-load exists; write the skill |
| 1 | Never annotate in the signal's own colour | F | same trigger as u2; the "keep it guarded" half is a test the skill asks for (palette ∉ data colours) | path-scoped force-load exists; write the skill |
| 2 | Show where the method breaks, not only where it works | F | presenting a results figure: Read of a scratchpad image after a tracked-source edit → present-results skill | transcript-event skill trigger |
| 3 | Say which reported numbers are trustworthy, inline | E | reply with a numeric metrics table carrying no qualifier token (measured/validated/indicative/caveat) on those lines | reply-shape scanner over assistant text |
| u3 | Throwaway renders in scratchpad; commit only final artifact + generator | C | added files named `diag*`/`scratch*`/`debug*`/`tmp*`, or images outside the artifacts dir | work key: forbidAddedFilesMatching |
| 4 | Keep the owner in the loop with pictures; ask only when theirs | E | AskUserQuestion count per owner turn; confirm-shaped question text; zero image Reads in a session that edited source | tool-call count/shape per turn |
| 5 | Finishing a unit of work — committed and pushed | C | at Stop: dirty tree, or HEAD ahead of `@{upstream}` | work key: requireCommittedAndPushed (upstream-ahead) |
| 6 | The owner's annotations are the ground truth | E | tracked pipeline edit with no later Bash run of the scoring harness (script named `score*`/`evaluate*`) | tool-call sequence; harness-script convention |
| 7 | Ground truth is annotated, never fabricated | B | set: derived-GT files (masks/labels dir); each resolves to a source annotation file by basename | derive paths; join by basename transform |
| 8 | Separate source-of-truth from generated artifacts | C | generated file (GENERATED-named or under the generated dir) changed ∧ neither source annotation nor generator changed | work key: changed-X-requires-changed-Y |
| 9 | Make extraction deterministic and self-checking | B | set: input stems (inputs dir); each appears in a pinned-count test assertion (`assert .*<stem>.*== \d+`) | derive from paths; each-value-appears-in-files-matching |
| 10 | Auto-detect annotation conventions; record them durably | A | relevantWhen annotations dir exists; repoWide unlessSomeFileMatches `/^##.*annotation conventions/im` → flag README | none |
| 11 | Verify the annotation parses before trusting a score | B | set: input stems; each has a registration/review overlay image (`*overlay*`/`*review*`) | derive paths; join by basename transform |
| u4 | Projects begin with a small learning set — a hazard | G | descriptive; the constraint lives in §4 rows | none |
| 12 | State the input format explicitly; one-line-per-input table | A | requireIndexCoverage eachTrackedPathMatching inputs dir → indexFile (inputs table doc) coveredByText `{base}` | indexFile selectable by whereFileContains, not exact path |
| 13 | Name the primary target regime and what is out of scope | A | checkSections requirePresent "Scope"/"Target regime" on the warm-up doc | warm-up doc path convention |
| 14 | Scale-awareness is a first-class concern | G | no static or event signature; the labelled-constant half is row 17 | none |
| 15 | No single-input special-casing; never key on filename | B | set: input file stems; forbid each as a string literal in pipeline source (tests, ingest manifest excluded) | derive from paths; forbidValueOfSetInFiles |
| 16 | Keep decision rules free of the measured prior | G | needs semantics of which quantity is "measured"; naming-dependent at best | none |
| 17 | Prefer scale-free rules; isolate and label scale-dependent constants | A | matchLines `/\b\w*(PX\|PIXELS?\|_MM)\b\s*=\s*\d/` unlessLineMatches / unlessPreviousLineMatches `/scale-dependent/` | none (label convention) |
| 18 | Name the hard constraint the task cannot trade away | A | checkSections requirePresent "Hard constraint" on the continuation/warm-up doc | doc path convention |
| 19 | Registry of domain assumptions, inline-tagged, each with a failure mode | B | set: `@assumption:<id>` captures in source ↔ rows of the assumptions doc; equal both ways; each row has a failure-mode cell | two-way set equality over regex captures |
| 20 | Guard the wins with regression tests; pin blessed scores | C | committed metrics JSON: a blessed input's score lower at head than base (jsonPair) | work key: forbidDecreasedNumberAtField |
| 21 | Iteration note: what was wrong | A | each `### R<n>` section of the notes doc contains a "wrong/observed" label line | checkSections at `###` depth; eachSectionMatches |
| 22 | Iteration note: what changed | A | each R-section contains a "changed" label line | same as 21 |
| 23 | Iteration note: the metric delta | A | each R-section contains a before/after pair or "delta" line | same as 21 |
| 24 | Iteration note: what you tried and rejected | A | each R-section contains a "rejected/tried" label line | same as 21 |
| p1 | A metric's definition is part of its identity; re-measure, never re-label | C | diff touches a `*metric*`/`*score*` function body ∧ metrics history file unchanged | work key: hunk-inside-function scope |
| p2 | Compare only normalized quantities; group rollups by source | G | which columns are raw vs normalized is semantic | none |
| p3 | Conversion factor measured per input, defined in exactly one place | B | set: files defining `scale_factor`/`*_per_px`/`calibration`; size ≤ 1; uncalibrated inputs carry a reason | count bound on regex-derived file set |
| 25 | Source updated — never the generated artifacts | C | dup of 8 | same as 8 |
| 26 | Artifacts regenerated with the committed generators | C | generator or source annotation changed ∧ no generated artifact changed; or run the generator, assert byte-equal | changed-X-requires-changed-Y; regenerateAndCompare |
| 27 | Tests green, scoring deltas reported per input, per metric | E | tracked pipeline edit ∧ reply carries no per-input delta table (tests-green half: the test/CI flow, X) | reply-shape scanner; changed-file ↔ reply join |
| 28 | Committed with a clear message and pushed | C | dup of 5 | same as 5 |
| 29 | Learnings cached: note, plus warm-up update if the map changed | C | files added/renamed/moved ∧ warm-up doc unchanged; source changed ∧ notes doc unchanged (s6) | work key: changed-X-requires-changed-Y |
| 30 | Separate work into explicit phases; say which | G | phase membership is narrative; no signature | none |
| 31 | Distinguish research spikes from the maintained pipeline | A | requireIndexCoverage eachTrackedPathMatching scripts → indexFile warm-up doc coveredByText `{base}` | indexFile by content selection |
| 32 | Keep a known-open-items / deferred list | A | checkSections requirePresent "Open items" on the continuation doc | doc path convention |
| 33 | Write a self-contained notes file per source | B | set: source PDFs/references (references dir); each has a notes `.md` by basename | derive paths; join by basename transform |
| 34 | Capture the method that exists only inside a figure | F | Edit/Write under the notes dir (`notes/**/*.md`) → force-load a summarize-a-source skill | path-scoped force-load exists; write the skill |
| 35 | Write down what the source fails to say — gap list | A | scanFiles `notes/**/*.md`; checkSections requirePresent "Gaps"/"Not stated" | notes path convention |
| 36 | Record where your approach diverges from the reference | A | checkSections requirePresent "Divergences" on each notes file | notes path convention |
| 37 | State what you deliberately omitted | A | checkSections requirePresent "Omitted" on each notes file | notes path convention |
| u5 | Upload paths are session-specific; the notes file is durable | A | matchLines forbid `/\/mnt\/user-data\|\/tmp\/uploads\|\/uploads\//` in tracked files | none |
| 38 | Samples vs illustrations; figures stored beside their notes | B | set: image files under the notes dir; each referenced from some notes `.md` | coverage by any-of-a-set index files |
| 39 | Render documents with a library, not an assumed system binary | D | Bash `/\b(pdftoppm\|pdftocairo\|mutool\|gs\|convert\|magick)\b/` → warn; A backstop: `subprocess.*pdftoppm` in tracked scripts | declarable Bash-shape PreToolUse guard |
| 40 | Verify identity of an extracted image by exact pixel diff | C | added image whose basename matches an existing input's basename ∧ no diff test/record added | work key: added files joined by basename |
| 41 | Grow the corpus by ranked fit; record licence and provenance | B | set: external dataset dirs/ids; each has a provenance row (licence, source) in the datasets doc | derive from paths; each-value-appears-in-doc-table |
| 42 | Make ingestion a committed, repeatable fetch script | A | relevantWhen `data/external` tracked ∧ noTrackedFileMatches `/(fetch\|ingest\|download)/` → flag | none |
| 43 | Respect the two validation tiers — don't mix them | B | set: dataset ids marked aggregate-only (doc table) ∩ ids in the detailed-harness config = ∅ | join across markdown table and config |
| 44 | External data is rarely drop-in; measure the gap | G | judgment; the tier discipline is row 43 | none |
| 45 | A fresh container has nothing installed; keep deps light | A | matchLines on `requirements*.txt`/`pyproject.toml`: `/^(torch\|tensorflow\|jax\|transformers)\b/` unlessWithinBlockOpenedBy optional-dependencies | none (Node half: `node/earn-each-dependency`) |
| 46 | A heavy learned route is gated, isolated, opt-in | A | same signature as 45: heavy dep outside an optional/extras group | none |
| 47 | Route around missing binaries; document install lines in the warm-up doc | A | checkSections requirePresent "Install"/"Setup" on the warm-up doc (`runnable-doc-commands` validates the lines) | doc path convention |
| 48 | Take an owner suggestion seriously even when "exhausted" | F | owner prompt phrase `/\b(try\|what about\|consider\|have you tried)\b.*\b(approach\|method\|algorithm\|filter)/i` → evaluate-an-idea skill | prompt-phrase skill trigger (UserPromptSubmit) |
| 49 | Evaluate it the same way as any change | F | same trigger as 48 | same as 48 |
| 50 | Beat the naive baseline, or drop it | F | same trigger as 48; E backstop: reply metrics table lacking a "baseline" row | same as 48; reply-shape scanner |
| 51 | Document the outcome fully, including walls | E | scratchpad experiment runs (Bash under the scratchpad) ∧ no edit to the notes doc this session | tool-call ↔ changed-file join |
| 52 | Complementary routes are not competitors | G | judgment | none |
| p4 | Cross-domain applicability out-of-band; speculation out of code | A | matchLines on source comments: `/(could\|might\|may) (also )?apply to\|generali[sz]es? to/i` | comments-only scan view (inverse of scanIgnoringComments) |
| 53 | Commit and push finished units | C | dup of 5 | same as 5 |
| 54 | Maintain a session warm-up doc | A | requirePaths warm-up doc; checkSections requirePresent "How to run", "Parameters", "Current numbers" | doc path convention |
| 55 | Maintain a continuation guide; keep headline metrics current | B | headline numbers quoted in the doc equal the metrics JSON's values; C variant: metrics changed ∧ doc unchanged | equality: regex capture ↔ parsed field |
| 56 | Capture the owner's new way durably | E | owner turn classified `process-change` (classifiedTurns, exists) ∧ no edit to warm-up/reference docs in the session | turn-class ↔ changed-file join |
| u6 | Follow branch/commit/PR conventions; no PR unless asked | D | `gh pr create` / `mcp__github__create_pull_request` with no owner turn mentioning a PR (`task-lifecycle` covers the issue ref) | MCP-arg + Bash guard with transcript precondition |
| p5 | §14: revive a prior session to enhance this document | H | an instruction for a different session kind (mining dialogue for preferences); `extract-from-conversations` owns it | re-home to claudinite-growth; delete here |

## web-scraping — `packs/web-scraping/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|---|---|---|---|
| 1 | Adding a source, or deciding what to parse | A | matchLines forbid positional selectors in parser source: `/:nth-child\(\|:nth-of-type\(\|\[\d+\]\/\|> div > div/`; the procedure half is `map-a-data-source` (exists) | none |
| 2 | A rendered-snapshot expectation shifting after a re-record | F | changed file under `__snapshots__/**`, `*.snap`, `fixtures/**/*.html` in the diff → re-review skill | change-scoped (diff path) skill trigger |
| 3 | Learning something non-obvious by probing the service | E | Bash/WebFetch/curl to a non-GitHub host this session ∧ no changed markdown beside the scraper | tool-call ↔ changed-file join |
| 4 | Writing the fetch itself | B | set: files with outbound HTTP call sites (`requests.`/`fetch(`/`http.get`/`urlopen`), tests excluded; size ≤ 1; that file has User-Agent, random delay, backoff | count bound on regex-derived file set |
| 5 | Deciding whether to retry a failed request | A | matchLines in the fetch module: retry on bare `except Exception`/`catch (e)` or `status >= 400` with no 4xx exclusion (weak) | none |
| 6 | Porting a fetch to a language-level HTTP client | C | removed lines match `curl .*--retry` ∧ added lines add `requests.`/`fetch(` with no `retry`/`backoff` | work key over removed + added lines |
| 7 | Setting the retry budget | B | captured `retries`, per-attempt `timeout` (fetch module) and workflow `timeout-minutes`: attempts×timeout+waits ≤ limit; backoff injectable (`sleep=`/`sleeper` param) | arithmetic over captures across files |
| 8 | One item in a batch failing to fetch | A | matchLines `/^\s*(raise\|sys\.exit\|throw)\b/` andWithinBlockOpenedBy `/^\s*for\b/` in the fetch/batch module (weak) | none |
| 9 | A sandbox refusing the target host | D | Bash `curl`/`wget`/`python .*requests` naming the target host; Write to `.github/workflows/*` naming it (host set read from the reference doc / fetch module) | Bash-shape + Write-path guard; host-set derivation |
| 10 | A fetch that works on your machine and fails from CI | G | diagnosis knowledge; a job-log 403/CAPTCHA is not a tool-input signature | none |
| 11 | Needing many items from a service with no list endpoint | G | knowledge; batch-halving has no static shape | none |
| 12 | A fetch that cannot produce a page at all | A | matchLines `/exit\([1-9]\|process\.exit\([1-9]/` andWithinBlockOpenedBy `/except\|catch/` in the fetch script | none |
| 13 | Deciding whether a fetch succeeded | A | checkEachFile fetch module: whenFileMatches `/status(_code)?\s*==\s*200\|\.ok\b/` require `/captcha\|challenge\|cloudflare\|just a moment/i` | none |
| 14 | Getting an empty body back | A | checkEachFile fetch module: require an empty-body branch `/not (body\|text\|html)\b\|\.length\s*===?\s*0/` (weak) | none |
| 15 | Choosing which field to read | B | set: status string literals compared in parser source ⊆ enum values listed in the reference doc; convenience booleans (`sold_out`, `is_available`) forbidden in filters | subset join: regex captures ↔ doc list |
| 16 | Filtering rows by a status | A | matchLines `/\bin\s+(ALLOWED\|GOOD\|OK)_?STATUS/i` or `status\s*==\s*['"]` in filter code; require an observed-set log (`Counter(`/`seen_statuses`) | none |
| 17 | Reading a numeric field | A | matchLines: `row[('price'\|'amount'\|'count'\|'qty')]` in arithmetic/comparison with no `float(`/`int(`/`Number(`/`parseFloat(` on the line | none |
| 18 | Reducing a set to its "cheapest" or "first" | A | matchLines `/\bmin\(\|sorted\(.*\)\[0\]\|\.sort\(.*\)\[0\]/` over price/ticket rows with no filter in the same block (weak) | none |
| 19 | Converting an instant to the domain's local time | B | set: files calling tz conversion (`astimezone`/`ZoneInfo`/`tz.localize`/`toLocaleString`); size ≤ 1; forbid ISO slicing `[:10]`/`[11:16]`; require a known-answer probe test | count bound on regex-derived file set |
| 20 | Taking a "now" | A | matchLines forbid `/datetime\.(utc)?now\(\)\|new Date\(\)\|Date\.now\(\)/` with no `tz=`/`ZoneInfo` on the line, in pipeline source | none |
| 21 | Parsing a value whose format is ambiguous | B | set: files calling date-parse with `dayfirst`/`locale`/`%d/%m`; size ≤ 1 (the helper), and it reads `<html lang>`/`og:locale` | count bound on regex-derived file set |
| 22 | Changing the conversion | C | tz/normalization helper changed ∧ no committed derived-data file changed | work key: changed-X-requires-changed-Y |
| 23 | Emitting a value your pipeline hasn't reached yet | A | matchLines in the normalizer: `.get(k, 0)`/`.get(k, '')`/`.get(k, False)`, `?? 0`, `?? ''`, `\|\| 0`, `\|\| false` | none |
| 24 | Deciding what a fetch writes to disk | A | relevantWhen fetch module exists: trackedFileMatches `/(cache\|html)\/.*\.html?$/` → flag (cache tracked); noTrackedFileMatches `/raw\/.*\.json/` → flag (no committed record) | none |
| 25 | Re-running a fetch that already ran | A | checkEachFile fetch module: require `/--force\|force_refresh\|skip_existing\|if .*exists\(/`; workflow fetch step's block carries a commit/push step | none |
| 26 | Scheduling the refresh | B | set: fetch scripts (files) ↔ workflow cron jobs invoking them; each script under its own schedule, no single cron running all | join: filenames ↔ workflow text |
| 27 | Generating the artifacts downstream of the stored data | C | derived artifact changed ∧ master/raw record unchanged in the same change; or run the generator twice, assert byte-equal | changed-X-requires-changed-Y; regenerateAndCompare |

## headless-browser — `packs/headless-browser/RULES.md`

Scan scope for every A row is structural, expressible today: harness files are those matching the pack's own fingerprint (driver module specifier or `.launch(`), selected with `relevantWhen.someTrackedFileContains` + `checkEachFile.whenFileMatches`.

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|---|---|---|---|
| 1 | Resolve the binary out of the environment; never let the driver download | A | matchLines forbid version-stamped browser paths `/(chromium\|chrome\|firefox\|webkit)[-_]?\d{3,}/` in source/config, and `playwright install` in scripts/workflows; checkParsedFiles package.json: prefer the `-core` package | none |
| 2 | A fresh install of the driver package is the same danger | D | Bash `/\b(npm\|pnpm\|yarn) (i\|install\|add)\b.*\b(playwright\|puppeteer)\b\|pip install playwright\|playwright install/` → block/warn | declarable Bash-shape PreToolUse guard |
| 3 | Stub a CDN library's API surface, don't reach the CDN | B | set: external `<script src="https://…">` hosts in served HTML ↔ `addInitScript` stubs naming each library's global in the harness | join: HTML src captures ↔ harness text |
| 4 | A pixel golden is comparable only under the exact build | A | relevantWhen tracked goldens (`/__screenshots__\|goldens\/\|\.golden\.png/`) → someTrackedFileContains `/browser\.version\(\)\|chromium\.version\|BROWSER_VERSION/` in the harness, else flag | none |
| 5 | Pinning buys zero-diff — the whole recipe or a tolerance | A | matchLines zero-tolerance compare (`maxDiffPixels:\s*0`/`threshold:\s*0`) ∧ repoWide unlessSomeFileMatches fontconfig + raster flags + version pin | none |
| 6 | Fake origin fulfilled from disk; abort anything unnamed | A | checkEachFile harness: whenFileMatches `/\.route\(/` require a catch-all `route\(['"]\*\*` with `\.abort\(`; forbid `createServer`/`.listen(` | none |
| 7 | Use an https fake origin | A | matchLines in harness: `/goto\(\s*['"]http:\/\/\|baseURL:\s*['"]http:\/\//` where a `route(` fake origin exists (unlessLineMatches localhost) | none |
| 8 | Route a vendored third-party asset host-agnostically | A | matchLines: `route(` pattern anchored on scheme+host for `.woff`/`.css`/`.png`/`.svg` assets (weak; prefer `**/*.woff2`) | none |
| 9 | Know which knobs are context-level and which per page | G | runtime API knowledge; two-contexts-vs-one has no static shape | none |
| 10 | A CLI window-size flag is not a viewport | D | Bash `/(chrome\|chromium).*--headless.*--screenshot.*--window-size/` → warn; A backstop on committed scripts/workflows | declarable Bash-shape PreToolUse guard |
| 11 | Install every fake as an init script | A | matchLines `/evaluate\([^)]*(Math\.random\s*=\|Date\s*=\|Date\.now\s*=\|localStorage\.\|navigator\.)/` in harness → should be addInitScript | none |
| 12 | Freezing CSS animation does not freeze the Web Animations API | A | checkEachFile harness: whenFileMatches `/animation-duration:\s*0/` require `/Element\.prototype\.animate\|\.animate\s*=\|getAnimations/` | none |
| 13 | Give the clock two modes and pick deliberately | A | checkEachFile: whenFileMatches `/clock\.(runFor\|fastForward)/` require `/clock\.(install\|pauseAt)/` (weak) | none |
| 14 | Vendoring web fonts is half the job — font jail | A | relevantWhen goldens tracked → repoWide unlessSomeFileMatches `/FONTCONFIG_FILE\|fonts\.conf/` | none |
| 15 | Ask the browser for reproducible rasterisation | A | relevantWhen goldens → require launch args `--disable-lcd-text`, `--font-render-hinting=none`, `--force-color-profile=srgb`, `--hide-scrollbars`, `--disable-gpu-rasterization`, `--disable-partial-raster`, `--disable-skia-runtime-opts` | none |
| 16 | Wait on something the page produces, never networkidle | A | matchLines forbid `/networkidle/` in harness/tests; checkEachFile: `screenshot(` present → require `document\.fonts\.ready` | none |
| 17 | Clip at an element's box, don't screenshot the element | A | matchLines forbid `/locator\([^)]*\)\.screenshot\(\|\$\([^)]*\)\.screenshot\(\|elementHandle\.screenshot/` in the capture harness | none |
| 18 | A bounding box is viewport-space and goes stale | A | matchLines: `clip:` fed directly from `boundingBox()` with no `scrollX`/`scrollY`/`pageXOffset` in the block, or without `fullPage: true` (weak) | none |
| 19 | Round a clip to whole pixels; clamp to page bounds | A | checkEachFile: whenFileMatches `/clip:\s*\{/` require `/Math\.(round\|floor\|ceil)/` and `/Math\.(min\|max)/` | none |
| 20 | Rendering a shipped page outside its runtime — strip its scripts | F | Edit/Write of a capture/rasterise harness file (`**/*{screenshot,capture,raster}*`) → force-load a capture-harness skill; A residue: `goto(…dist/build…)` → require script stripping | path-scoped force-load exists; write the skill |
| 21 | Launch once, reuse the browser across captures | A | countMatchingLines `/\.launch\(/` atMost 1 per file; matchLines `.launch(` andWithinBlockOpenedBy `/^\s*(for\|test\|it)\b/` | none |

## executable-requirements — `packs/executable-requirements/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Everything lives under `dev/requirements/` | A | `requirePaths` spec; case/golden files (`*.case.*`, `*.png`) outside `dev/requirements/` flagged by path | path-only flag key (`forbidPathsMatching`) |
| 2 | A requirement line starts with backtick dotted number | A | `scanFiles` spec + `matchLines` on list lines whose dotted number is unbackticked; `countMatchingLines atLeast 1` for ids | `scanFiles.fromPackConfig` (`config.spec`, defaultingTo) |
| 3 | The line is a one-liner; detail collapses | A | leaf line `andIndentedBlockBelowMatches /\S/` outside `<details>…</details>` spans | span blanking key (`scanIgnoringSpansBetween`) |
| 4 | The folder is the kind; case naming | A | files under `*/cases/` must match `<slug>.<id>.case.<ext>`; `matchLines /\bkind\s*[:=]/` forbidden in cases | path-shape assertion key |
| 5 | Artifact expecteds live beside their case | B | set: `<slug>.<id>` from golden paths; each joins a `<slug>.<id>.case.*` in same dir; no tracked `actual/diff` artifacts | `extractValueSets.fromPathsMatching` (captures) + path join |
| 6 | Manifest ⇄ disk equality where no dynamic discovery | B | set A: case paths per kind dir; set B: captures from the kind's `manifest` file; A = B | captures-from-text set + `setsEqual` |
| 7¶ | The bijection gate must fail on every one of… | B | set: leaf ids from spec captures; set: ids from case paths; each leaf claimed exactly once, each case resolves; kinds ⇄ registry | path/text capture sets + exactly-once join |
| 8¶ | Feature run: spec commit precedes code commit | X | — | `feature-requirements-first` |
| 9¶ | Route each leaf to the kind that can see it | F | trigger: Write/Edit creating `dev/requirements/(behavior|logic)/cases/*` — skill asks "could a golden see this?" | skill + `force-load-on-file-edits-paths` |
| 10 | surface snapshot: one golden per leaf | B | set: case ids in image kinds (dirs holding `.png`); each has exactly one `<slug>.<id>.png` | path-capture join with count == 1 |
| 11 | behavior: no images in the folder | A | tracked `dev/requirements/behavior/**/*.(png|apng|gif|jpg)` flagged by path | path-only flag key |
| 12 | logic: coded `verify()` importing shipped code | A | `checkEachFile` on `logic/cases/*`: `require /\bverify\s*\(/`, `require /from ['"]\.\.\//` | none (import-resolves-outside-tree half: B via module-imports) |
| 13 | saga (§4) pointer | G | definition only | none |
| 14 | per-project kinds (extractor/support/server) | F | trigger: Write/Edit under a `dev/requirements/<kind>/` absent at base (new kind dir) | path-scoped skill on `dev/requirements/**` |
| 15 | heavy/e2e singleton: own lane, never default | B | set: case paths under `e2e|heavy` kind; count ≤ 1; `scripts.test` in package.json excludes that lane (negative-lookahead) | tracked-path count bounds assertion |
| 16 | Saga case = steps; one frame per step `step-NN.png` | B | set: saga case ids; frames `<slug>.<id>.step-NN.png` per id, NN contiguous from 01 | path-capture group-by-key + sequence assertion |
| 17 | The caption narrates the story | A | `matchLines /caption\s*:\s*(['"])\1/` (empty caption) in `saga/cases/*` | none (wording half stays judgment) |
| 18 | One saga = one leaf; 3–6 frames | B | map: saga id → count of `step-NN.png`; 3 ≤ n ≤ 6 | per-key count bounds over path set |
| 19 | Saga steps drive the same real entry point | B | set: entry module imported by snapshot cases; every saga case imports it | `extractValueSets.fromImportsOf` + join |
| 20 | Strip dead delay, keep the animation | H | harness-implementation requirement (APNG recorder dedups identical frames) | re-home: vendored recorder stub + its own test |
| 21 | Lossless APNG, not GIF; per-frame diff dir | A | tracked `*.gif` under `dev/requirements/` flagged; `.gitignore` covers failures dir | path-only flag key |
| 22 | Mark the gesture | H | harness-implementation requirement (gesture ring) | re-home: vendored recorder stub + test |
| 23 | Pin the clock (`REFERENCE_NOW`) | A | `scanFiles dev/requirements/**` + `scanIgnoringComments` + `matchLines /Date\.now\(\)|new Date\(\)|DateTime\.now\(\)/` | none |
| 24 | Fake every nondeterministic input | A | `matchLines /Math\.random\(|https?:\/\/(?!localhost)/` in harness; `countMatchingLines atLeast 1` viewport/locale pins in `shared/` | none |
| 25 | Load real fonts in the render harness | A | `repoWide`: unless some `shared/**` file matches `/FontLoader|loadFont|\.(ttf|woff2?)/`, flag the render entry | none |
| 26 | Never wait for "settled" | A | `matchLines /pumpAndSettle\(|waitForSelector\(/` in `dev/requirements/**` | none (dup flutter #7) |
| 27 | Browser-extension / DOM recipe | F | trigger: Write/Edit creating `dev/requirements/shared/**` render harness in a repo with `manifest.json` | path-scoped skill carrying the recipe |
| 28 | Flutter recipe; one fake world shared | B | set: files defining `class FakeWorld`; count == 1, under `lib/testing/`; requirements suite imports `package:<pubspec.name>/testing/` | repo-wide file-count bound + pubspec name join |
| 29 | Comparison is pixel-exact, no tolerance | A | `matchLines /threshold\s*:\s*(?!0\b)|tolerance\s*[:=]\s*(?!0\b)|maxDiffPixels/` under `dev/requirements/` | none |
| 30 | The spec doubles as a visual gallery | A | `requireIndexCoverage.eachTrackedPathMatching /\.png$/` → `indexFile` spec `coveredByText {path}`; image line `unlessPreviousLineMatches` marker | `indexFile` from pack config |
| 31 | Gallery gate; regenerate, never hand-edit | D | Edit/Write on spec whose `new_string` touches a marker-tagged image line → block "run the generator" | PreToolUse content-pattern guard on Edit input |
| 32¶ | Refresh regenerates goldens + gallery; never fixes red | E | Bash `refresh|--update-goldens` after a failing test result with no owner-approval turn between | transcript tool-sequence + owner-turn gate |

## spec-driven-product — `packs/spec-driven-product/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | One numbered requirements document | A | `requirePaths` the spec (`config.spec` default `dev/requirements/requirements.md`) | `scanFiles.fromPackConfig` |
| 2 | Keep the spec's boundary crisp | B | set: leaf ids with no case → red (a statement no kind proves is not a leaf) | same bijection sets as ER-7 |
| 3 | Every leaf carries a stable id; never renumber | C | base-vs-head of spec: leaf-id captures present at base and absent at head | work key `forbidRemovedCaptures {file, pattern}` |
| 4 | Doc-first, red by default | B | set: leaf ids; each has ≥1 case path | bijection sets (ER-7) |
| 5 | The spec drives the tests, never the other way | C | diff changes `<slug>.<id>.case.*` or its golden while the spec's `<id>` line is unchanged | work key `changedFileWithoutSibling` joined on id capture |
| 6 | Enforce the bijection with a coverage gate | B | ER-7 sets, plus: kind dirs (minus `shared`) = registry entries (captures) | path-derived set ⇄ captures equality |
| 7 | A kind is one way to assert; keep extensible | F | trigger: Write/Edit under a `dev/requirements/<kind>/` absent at base | path-scoped skill |
| 8 | A kind may be a singleton | G | permission, no signature | none |
| 9 | Named lane per runner; default lane fast | A | `checkParsedFiles package.json requireFieldMatching scripts.test /^(?!.*e2e)/`; workflow `countMatchingLines atLeast 1 /e2e|heavy/` when e2e dir exists | none |
| 10 | Actuals come from the real code | B | set: resolved imports per case file; each case imports ≥1 module outside `dev/requirements/` | `extractValueSets.fromImportsOf` + resolves-to-path outside prefix |
| 11 | Committed expecteds are the owner's approval record | G | principle enforced by #12/#13 | none |
| 12 | Two honest shapes; never modify a committed expected | D | Edit/Write/Bash-cp targeting a tracked `*.png`/`expected/*.json` → block unless sibling case file is untracked | PreToolUse path guard with tracked-status condition |
| 13 | On a mismatch surface actual vs expected and ask | E | golden-rewriting command after a red run, no owner turn in between (ER-32) | transcript sequence + owner-turn gate |
| 14 | Expected changes ride the normal review flow | X | moot: committed expecteds are diff content by construction | harness |
| 15 | Multi-tier rule gets sibling leaves | F | trigger: Edit/Write on the spec file adding an id line | `force-load-on-file-edits-paths` on spec path |
| 16 | Proof lives where the rule is enforced | A | `relevantWhen.trackedFileMatches /^(server|backend|functions)\//` + `requirePaths dev/requirements/server/` | none |
| 17 | Each supported target is its own leaf | B | set: targets (manifest `host_permissions`/`content_scripts.matches` or a targets table); each covered by a case path `extractor/cases/<target>.*` | `eachValueOfSet` → `coveredByTrackedPathMatching` |
| 18 | Prove each target against a committed real sample | B | set: `extractor/cases/<target>.*`; each joins `samples/<target>.*` beside it | path-capture join |
| 19 | Adding a target is a documented flow | A | `checkSections.requirePresent "Adding a target"` on `dev/requirements/README.md` when extractor kind exists | none |
| 20 | Say what the harness cannot reach (banner + issue) | A | `checkEachFile` spec `require /^> .*harness.*#\d+/m` (named banner linking an issue) | none |
| 21 | Deliberate gaps marked at the leaf and allowlisted | B | set: leaf ids carrying the TBD marker; set: allowlist entries (parsed); sets equal | captures set ⇄ parsed-array set equality |
| 22 | Embed regenerated renders in the spec | A | dup ER-30: `requireIndexCoverage` goldens → spec | `indexFile` from pack config |
| 23 | Regenerate, never hand-edit | D | dup ER-31 | PreToolUse content guard on Edit |
| 24 | Golden-image method is canon in writing-tests | G | pointer to a skill | none |
| 25 | `main` releasable; automation releases | H | release contract belongs to the platform release pack (Chrome: `cer/release-workflows`, `store-release` task) | re-home |
| 26 | The version users see moves deliberately | C | parsed base-vs-head `version`: minor/major bump on a non-main branch → advisory | work key: parsed-field change predicate |

## chrome-extension — `packs/chrome-extension/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1¶ | Read the release standard before touching release machinery | X | — | `chrome-store-releases` `force-load-on-file-edits-paths` + `skill-loaded-before-editing` |
| 2 | Handing a path to a Chrome API from the service worker | A | `scanFiles{inParsedFilesMatching manifest, namedByField background.service_worker}` + `matchLines /\b(importScripts|setIcon|fetch)\(\s*['"](?!\/|https?:|chrome-extension:)/` | none |
| 3 | Wanting `import`/`export` — declare `"type": "module"` | B | worker file (named by manifest) has static `import` ⇒ manifest `background.type == module`; package.json lacks bundler deps | `checkParsedFiles.whenFileNamedByFieldMatches` (cross-doc conditional) |
| 4 | Assembling a shared global — augment, never replace | A | content-script files (`namedByField content_scripts.js`) + `matchLines /^\s*(globalThis|window)\.\w+\s*=\s*\{/ unlessLineMatches /Object\.assign|\?\?=/` | none |
| 5 | Accumulating state in a re-injected file — reset at load | A | content-script files + `matchLines /globalThis\.\w+\.\w+\s*(\?\?=|\|\|=)\s*\[\]/` (persisted accumulator) | none |
| 6 | Loading ES module code into a content script | X | — | `content-script-module-syntax` |
| 7 | Adding an import to a content-script module — list its graph | B | set: transitive import graph from each content-script `import(getURL(...))` entry; each ⊆ `web_accessible_resources[].resources` (glob-aware) | `extractValueSets.fromImportGraphOf` + glob coverage |
| 8 | Keeping that list correct — a test walks the graph | B | same set as #7; the check replaces the project-level test | same as #7 |
| 9 | Matching a host with `UrlFilter` | A | `scanIgnoringComments` + `matchLines /hostSuffix\s*:\s*['"](?!\.)/` | none |
| 10 | Content script on arbitrary pages without install warning | A | manifest `content_scripts[].matches` holds `<all_urls>`/`*://*/*` → advisory; `matchLines /permissions\.request\(/ andWithinBlockOpenedBy /onMessage\.addListener/` | `checkParsedFiles` array fan-out on field paths |
| 11 | Starting the worker with a runtime-granted permission | A | `scanFiles{inParsedFilesMatching manifest, whereFileContains optional_host_permissions, namedByField background.service_worker}` + `checkEachFile.require /permissions\.(contains|getAll)\(/` | none |
| 12 | A fetch to a listed host failing — CORS | G | debugging knowledge, no signature | none |
| 13 | Reaching your own backend — no `host_permissions` entry | F | trigger: diff adds a `host_permissions` value (`forbidAddedValueInArray`; `cer/permission-added-store-issue` fires only where shipping) | skill/advisory text at that trigger |
| 14 | Authenticating to a JWT-validating backend | A | `matchLines /identity\.getAuthToken\(/`; `checkEachFile whenFileMatches launchWebAuthFlow require /nonce/`; manifest `requireField key` when relevant | none |
| 15 | Refreshing a token silently — `prompt=none` | A | `checkEachFile whenFileMatches /interactive\s*:\s*false/ require /prompt=none/` | none |
| 16 | Refreshing silently with several accounts — `login_hint` | A | `checkEachFile whenFileMatches /interactive\s*:\s*false/ require /login_hint/` | none |
| 17 | Storing a token — `storage.session` only | A | `matchLines /storage\.local\.set\(\s*\{[^}]*\b(token|jwt|bearer)\b/i` | none |
| 18 | Token surviving restart — no refresh-token flow | A | `matchLines /refresh_token|access_type=offline/` → advisory | none |
| 19 | Knowing whether the side panel is open | A | `matchLines /sidePanel\.(isOpen|close|getIsOpen)\(/` (API that does not exist) | none |
| 20 | Opening the side panel — Chrome 116+ | A | `relevantWhen.someTrackedFileContains /sidePanel\.open\(/` + manifest `requireFieldMatching minimum_chrome_version /^(11[6-9]|1[2-9]\d)/` | none |
| 21 | Putting a menu on the toolbar icon | G | how-to, no signature | none |
| 22 | Recreating menu items — `removeAll()` first | A | `checkEachFile whenFileMatches /contextMenus\.create\(/ require /contextMenus\.removeAll\(/` | none |
| 23 | Awaiting a `chrome.*` callback in `Runtime.evaluate` | A | `checkEachFile whenFileMatches /Runtime\.evaluate/ forbid /expression:\s*[`'"][^`'"]*await\s+chrome\./` | none (fragile) |
| 24 | Reading a worker value from an evaluate | B | set: identifiers probes evaluate; each appears as `globalThis.<id>\s*=` in the worker | captures set + join |
| 25 | Attaching to a dormant worker — poll | G | control-flow, no static signature | none |

## macos — `packs/macos/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | SwiftPM builds a binary; one script assembles the bundle | B | set: files (scripts + workflows) containing `Contents/MacOS`; count == 1 | repo-wide file-count bound |
| 2 | Commit one icon master; generate `.icns` | A | tracked `*.icns`/`*.iconset/**` flagged by path; `repoWide` unless some script matches `/iconutil -c icns/` | path-only flag key |
| 3 | Menu-bar-only app is `LSUIElement: true` | A | swift has `NSStatusBar` and no `NSWindow|WindowGroup` ⇒ `Info.plist` `require /LSUIElement<\/key>\s*<true/` | `relevantWhen.noTrackedFileContains` |
| 4 | Pin `LSMinimumSystemVersion` to `platforms:` | X | — | `minimum-system-version-agrees` |
| 5 | Reaching for a protected resource — usage string | A | per pair: `relevantWhen.someTrackedFileContains {swift, /SFSpeechRecognizer/}` + plist `checkEachFile.require /NSSpeechRecognitionUsageDescription/` (table of API→key) | none (a `pairs` key would collapse N declarations) |
| 6 | Notarization needs Hardened Runtime + explicit entitlement | A | `relevantWhen` swift `installTap|AVAudioEngine`; `repoWide` unless some `.entitlements` has `audio-input…<true`, flag files matching `--options runtime` | none |
| 7 | TCC-only capabilities need no entitlement | A | `.entitlements` `matchLines /com\.apple\.security\.(speech|speech-recognition|microphone)\b/` (not real keys) | none |
| 8 | Do not enable App Sandbox on Developer ID | A | `relevantWhen` workflows `/Developer ID|notarytool/` + `.entitlements` `forbid /app-sandbox<\/key>\s*<true/` | none |
| 9 | `SFSpeechRecognizer` streams by default — opt in per request | A | `checkEachFile whenFileMatches /SFSpeech\w*RecognitionRequest\(/ require /requiresOnDeviceRecognition\s*=\s*true/` | two-pattern per-file count equality (per site) |
| 10 | Opt-in only where the locale model is installed | A | `checkEachFile whenFileMatches /requiresOnDeviceRecognition\s*=\s*true/ require /supportsOnDeviceRecognition/` | none |
| 11 | Speech is TCC-gated: usage string, no entitlement | A | dup of #5/#7 | none |
| 12 | The unsigned path must stay a working path | A | workflow `run:` with `codesign --sign <identity>` whose step lacks `if: … secrets.` | YAML same-mapping sibling relation |
| 13 | An ad-hoc signature cannot be notarized | A | `notarytool submit` step not gated on the identity secret / same step as `codesign -s -` | same sibling relation |
| 14 | Notarize then staple | A | `checkEachFile whenFileMatches /notarytool submit/ require /stapler staple/, /stapler validate/`; `matchLines /notarytool submit(?!.*--wait)/` | none |
| 15 | Imported identity must be in the keychain list | A | `checkEachFile whenFileMatches /security import/ require /security list-keychains/` | none |
| 16 | Say in a build annotation which lane ran | A | `checkEachFile whenFileMatches /codesign -s -/ require /::notice::|::warning::|GITHUB_STEP_SUMMARY/` | none |
| 17 | A DMG is a staged folder, not Finder scripting | A | `matchLines /osascript.*Finder|tell application "Finder"/`; `whenFileMatches /hdiutil create/ require /\.VolumeIcon\.icns/` | none |
| 18 | Write the Gatekeeper bypass for the current OS | A | markdown `matchLines /(right|control)-click.*Open/i`; require `/Open Anyway|xattr -dr com\.apple\.quarantine/` | none |
| 19 | A notarized build should need none of that | A | `relevantWhen` workflows `/notarytool/` + README `matchLines /xattr -dr com\.apple\.quarantine|Open Anyway/` → advisory | none |
| 20 | Diagnostics use only what ships with macOS | A | `scanFiles /(diagnos|doctor)[^/]*\.sh$/` + `matchLines /\b(swift|swiftc|xcodebuild|xcrun|brew|python3?)\b/` | none |
| 21 | `command -v swift` is not a toolchain test | A | `matchLines /command -v swift|which swift/` in `*.sh`/workflows | none |
| 22 | `NSApplication` installs no signal handlers | X | — | `signal-teardown-routing` (+ `sudden-termination-vs-teardown`) |
| 23 | An uncaught Objective-C exception is an exit path | G | no static signature for raise-vs-throw | none |
| 24 | No "the machine is back" notification — fan in | A | `checkEachFile whenFileMatches /didWakeNotification/ require /screensDidWake|sessionDidBecomeActive|screenIsUnlocked/` | none |
| 25 | Coalesce with an id, not a boolean | A | `matchLines /var (pending|isPending)\s*(: Bool)?\s*=\s*(true|false)/` in files matching wake/timer | none (fragile) |
| 26 | `asyncAfter` before sleep fires on wake — generation | A | `checkEachFile whenFileMatches /asyncAfter\(/ and /WakeNotification/ require /generation|epoch/` | none (identifier-name reliance) |
| 27 | Measure a sleep-spanning span with `Date()` | A | `matchLines /processInfo\.systemUptime/ whenFileMatches /WakeNotification|SleepNotification/` → advisory | none |
| 28 | Release the device on every path capture ends | A | `whenFileMatches /installTap\(/ require /removeTap\(/`; `AudioDeviceCreateIOProcID` ⇒ `AudioDeviceDestroyIOProcID` | none (pair presence, not every path) |
| 29 | Never construct a capture engine as a probe | A | `matchLines /AVAudioEngine\(\)/ andWithinBlockOpenedBy /func (probe|isAvailable|deviceExists|hasInput)/`; `countMatchingLines atMost 1` | none |
| 30 | Presence is not usability — read both formats | A | `checkEachFile`: file reads `outputFormat(forBus` xor `inputFormat(forBus` → flag; sample-rate read requires nonzero guard | none |
| 31 | A duration is a claim about an observed span | A | `whenFileMatches /scheduledTimer\([^)]*repeats:\s*true/ require /\.fire\(\)/`; settle-clock file requires `/willSleepNotification/` | none (fragile) |
| 32 | "Started" is not "working" — health state | H | product requirement (a rendered health state, named remedies) → requirements doc + leaf | re-home |
| 33 | Compile-green is not a gate for device code | E | changed files containing `installTap|AVAudioEngine|AudioObject` with no Bash `swift run|open .*\.app` in the transcript, or an unverified statement in the reply | changed-file predicate joined to transcript tool calls |

## flutter — `packs/flutter/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Widgets depend on ports, never on plugins | A | `scanFiles /^lib\/(ui|screens|widgets)\//` + `matchLines /^import ['"]package:(geolocator|firebase_\w+|google_sign_in|cloud_functions)\//`; adapter constructors outside `main.dart` | none (B variant: `keysOfObjectAtField` pubspec `dependencies`) |
| 2 | Enforce the boundary with a committed import-scan test | A | dup #1 — the declared check IS the enforcement | none |
| 3 | Ship the fakes in the package (`lib/testing/`) | B | set: files defining `class FakeWorld`; count == 1, under `lib/testing/`; test files naming it import `package:<pubspec.name>/testing/` | repo-wide file-count bound + pubspec-name join |
| 4 | Extract the root shell into `lib/app.dart` | A | `scanFiles testFiles` `matchLines /\bMaterialApp\s*\(/` forbidden; `main.dart` `require /\bApp\(/` | none |
| 5 | Inject the clock | A | `scanFiles /^lib\/(?!testing\/)/` + `scanIgnoringComments` + `matchLines /DateTime\.now\(\)/ unlessFileMatches /class \w*Clock/` | none |
| 6 | Load real fonts before any golden | A | `repoWide`: unless some test file matches `/FontLoader\(/`, flag files matching `/matchesGoldenFile/` | none (`styleFrom` half: multi-line, partial) |
| 7 | Never `pumpAndSettle` around indeterminate indicators | A | test files `matchLines /pumpAndSettle\(/ whenFileMatches /matchesGoldenFile/` → advisory; `tap(` followed by one pump | next-line relation (`unlessFollowingLineMatches`) |
| 8 | Anything that fetches must be injectable | A | `scanFiles /^lib\/(?!testing\/)/` + `matchLines /\bNetworkImage\(|Image\.network\(|NetworkTileProvider\(/` | none |
| 9 | Fix the viewport per suite | A | `checkEachFile whenFileMatches /matchesGoldenFile/ require /physicalSize\s*=/, /devicePixelRatio\s*=/, /addTearDown|tearDown/` | none |
| 10 | Async lifecycle guards need an epoch counter | A | `checkEachFile whenFileMatches /Future<void> start\(\)[\s\S]*await/ and /stop\(\)/ require /epoch|generation/` | none (identifier-name reliance) |
| 11 | Verify plugin APIs against installed source | F | trigger: Edit/Write whose `new_string` adds `import 'package:<plugin>/` or a pubspec `dependencies` line → read `~/.pub-cache/…/<pkg>-<ver>/lib/` | content-scoped skill trigger (or D guard on Edit input) |
| 12 | `pubspec.lock` moving without `pubspec.yaml` | C | diff changes `pubspec.lock` while `pubspec.yaml` `dependencies` unchanged base-vs-head | work key `changedFileWithoutSibling {file, sibling}` |
| 13 | `flutter analyze` at zero issues; narrow disables | A | `analysis_options.yaml` `matchLines /^\s+\w+:\s*false\s*$/ unlessPreviousLineMatches /^\s*#/ andWithinBlockOpenedBy /^\s*rules:/`; workflows `matchLines /flutter analyze(?!.*--fatal-infos)/` | none |
| 14 | Sandboxed/CI runners — `flutter test` stalls | A | workflows `matchLines /^\s*run:\s*flutter test\b/` whose step lacks `timeout-minutes`/wrapper | YAML sibling relation; or vendor the wrapper as a stub |
| 15 | The web sandbox ships no Flutter SDK | X | — | pack `env` block + `env-requirements.mjs` + SessionStart assertion |

## firebase — `packs/firebase/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | End every ruleset with catch-all deny | A | rules files named by `firebase.json` (`firestore.rules`/`storage.rules`); `checkEachFile.require` final `match /{document=**}` block with `allow read, write: if false` | none (`scanFiles.inParsedFilesMatching+namedByField`, `checkEachFile.require`) |
| 2 | Write rules against merge semantics | A | `matchLines /request\.resource\.data\.keys\(\)/ andWithinBlockOpenedBy /allow\s+update/` | none |
| 3 | Guard every field dereference for absence | A | `matchLines /request\.resource\.data\.\w+|\bd\.\w+/ unlessLineMatches /\bin\b|\.get\(|hasAny|hasAll/` (advisory heuristic) | none; a rules-language parser would make it exact |
| 4 | Server-owned fields absent from allowed key list | A | `matchLines /request\.resource\.data\.(\w+)\s*==\s*resource\.data\.\1/` (equality-pin instead of `hasOnly`) | none |
| 5 | Pin client timestamps to request.time | A | `checkEachFile whenFileMatches /is timestamp/ require /==\s*request\.time/` | none |
| 6 | Bound every client-writable string/blob | A | `matchLines /is (string|bytes)/ unlessLineMatches /\.size\(\)\s*<=?/` (advisory) | none |
| 7 | Admin-SDK code bypasses rules | F | trigger: file-tool edit of `**/firestore.rules`, `**/storage.rules` → force-load a rules-review skill enumerating function writes | skill + `force-load-on-file-edits-paths` |
| 8 | Identity from verified token, never request body | A | functions source: `matchLines /\b(data|request\.data|req\.body)\.(uid|userId|email|displayName)\b/` | none |
| 9 | Validate inputs at the boundary | A | `checkEachFile whenFileMatches /onCall\(/ require /HttpsError/`; `matchLines /typeof \w+ === ['"]number['"]/ unlessLineMatches /isFinite/` | none |
| 10 | Rate limits need a transaction | A | `checkEachFile whenFileMatches /cooldown|rateLimit|lastCall/i require /runTransaction\(/` (advisory) | none |
| 11 | Chunk batched writes under 500 | A | `checkEachFile whenFileMatches /writeBatch\(|\.batch\(\)/ require /chunk|slice\(/`; forbid literal `\b500\b` (advisory) | none |
| 12 | Push is best-effort | A | `checkEachFile whenFileMatches /getMessaging\(|\.messaging\(\)/ require /registration-token-not-registered/` | none |
| 13 | Extract decision logic into pure modules | A | functions `package.json` `scripts.test` forbid `/emulators:exec/`; testFiles `matchLines /from ['"]firebase-admin/` (advisory) | none |
| 14 | Test rules empirically | A | `relevantWhen trackedFileMatches /\.rules$/`; `repoWide unlessSomeFileMatches /@firebase\/rules-unit-testing/ flagFilesMatching` rules files | none |
| 15 | Cross-language contracts get mirrored test vectors | B | DERIVE: vector fixture files paired by basename across client and server suites; ASSERT: each pair byte-equal | `requireFilesEqual` (pair by basename) |
| 16 | Keep Firebase project root self-contained | A | `.gitignore` `checkEachFile.require /^\.firebase\/?$/m` + `/functions\/lib/`; forbid tracked `functions/lib/**`, `.firebase/**` | `forbidTrackedPathsMatching` (path-only assertion) |
| 17 | Commit .firebaserc with named aliases | A | `scanFiles .firebaserc`+`whenMissing`; `checkParsedFiles requireField projects.default`; markdown `matchLines /firebase deploy\b/ unlessLineMatches /--only/` | none |
| 18 | Smoke-load built entrypoint in test lane | A | `repoWide unlessSomeFileMatches /node -e .*require\(.*lib\/index/ flagFilesMatching` functions `package.json` carrying `"build"` | none |

## node — `packs/node/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Named import from CJS entry yields undefined | G | needs the installed package's entry kind (node_modules untracked); tail A: `matchLines /\/usr\/(local\/)?lib\/node_modules\//` | none |
| 2 | Modern Node detects ESM in .js | A | `scanFiles /package\.json$/` `checkEachFile.forbid /^\s*\{\s*"type"\s*:\s*"module"\s*\}\s*$/` (vestigial manifest) | none |
| 3 | node --test skips dot-directories; paths must resolve | B | DERIVE: every path/glob argument of `node --test` in workflows, scripts, package.json; ASSERT: each matches ≥1 tracked file | `extractValueSets` from regex captures + "value resolves to tracked path/glob" assertion |
| 4 | body.innerText is null in jsdom | A | `relevantWhen someTrackedFileContains package.json /"jsdom"/`; `matchLines /\.innerText\s*\|\|\s*\w+\.textContent/` (advisory) | none |
| 5 | runScripts outside-only parses noscript | A | `matchLines /new JSDOM\(/ whenFileMatches /noscript/ unlessLineMatches /runScripts/ unlessIndentedBlockBelowMatches /runScripts/` (advisory) | none |

## web-speech — `packs/web-speech/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Recognizer owns its own microphone capture | A | `matchLines /suppressLocalAudioPlayback|restrictOwnAudio/ andWithinBlockOpenedBy /getUserMedia\(/`; preflight-warm half stays prose | none |
| 2 | Read the whole n-best list | A | `checkEachFile whenFileMatches /SpeechRecognition\b/ require /maxAlternatives\s*=\s*([2-9]|\d{2,})/` | none |
| 3 | onresult/onend/onerror settle once | A | `checkEachFile whenFileMatches /\.onend\s*=|['"]end['"]/ require /settled/` (advisory heuristic) | none |
| 4 | isFinal — treat final unless === false | A | `matchLines /if\s*\(\s*!?\w+\.isFinal\s*\)/ unlessLineMatches /!==\s*false/` | none |
| 5 | Classic recognizer streams to cloud; on-device opt-in | A | `matchLines /['"]downloadable['"]/ whenFileMatches /\.available\(/`; `checkEachFile whenFileMatches /processLocally\s*=\s*true/ require /\.available\s*\(/` | none |
| 6 | Contextual biasing only on-device | A | `checkEachFile whenFileMatches /SpeechRecognitionPhrase|\.phrases\s*=/ require /processLocally/`; boost literal bound via `matchLines` | none |
| 7 | Map raw error names to a taxonomy | A | `checkEachFile whenFileMatches /\.onerror\s*=/ require /['"]aborted['"]/` in recognizer files | none |
| 8 | Missed endpoint needs a pause watchdog | A | `matchLines /setTimeout\([^,]+,\s*(\d{1,3}|1[0-4]\d\d)\s*\)/ whenFileMatches /onresult/` (advisory: <1500 ms) | none |
| 9 | Mic permission per-origin; retry bare | A | `checkEachFile whenFileMatches /getUserMedia\(\s*\{\s*audio\s*:\s*\{/ require /getUserMedia\(\s*\{\s*audio\s*:\s*true/` | none |
| 10 | Prefer chrome.tts over speechSynthesis | A | `relevantWhen someTrackedFileContains manifest.json /"manifest_version"\s*:\s*3/`; `repoWide unlessSomeFileMatches /chrome\.tts\.speak/ flagFilesMatching [[/speechSynthesis\.speak/]]`; `checkParsedFiles manifest.json requireValueInArray permissions "tts"` | none |
| 11 | chrome.tts absent in content script — relay | A | `scanFiles.inParsedFilesMatching manifest.json namedByField content_scripts.js` + `matchLines /chrome\.tts\./`; `checkEachFile whenFileMatches /onDisconnect/ require /resolve/` | none |
| 12 | Voice lists load lazily | A | `matchLines /^(const|let|var)\s+\w+\s*=\s*(window\.)?speechSynthesis\.getVoices\(\)/` | none |
| 13 | Don't trust the default voice | A | `checkEachFile whenFileMatches /SpeechSynthesisUtterance\(/ require /\.voice\s*=/` (advisory) | none |
| 14 | Resolve speak() on any terminal event | A | `checkEachFile whenFileMatches /chrome\.tts\.speak/ require /enqueue:\s*false/`,`/interrupted/`,`/cancelled/`; `matchLines /reject\(/ andWithinBlockOpenedBy /onerror|onend|onEvent/` | none |
| 15 | Neither engine supports SSML | A | `matchLines /<speak\b|<prosody\b|<break\b|<emphasis\b/ whenFileMatches /speechSynthesis|chrome\.tts/` | none |

## html — `packs/html/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Injected block markup inside a p | A | `matchLines /<p\b[^>]*>[^<]*<(div|ul|ol|table|section|pre|h[1-6]|blockquote)\b/` over html/js/jsx/template strings | none |
| 2 | Ambiguous slash date — infer convention once | F | trigger: an added line matching `/split\(['"]\/['"]\)|\d{1,2}\/\d{1,2}\/\d{2,4}/` in parsing code → load a date-parsing skill | added-line-pattern skill trigger (content, not path) |
| 3 | Investigate live before you ship | E | assistant text matching `/(test|verify|check) (it )?(after|once) .*(deploy|releas)/i` with no DevTools-snippet turn | transcript assistant-text pattern assertion |
| 4 | Console request is a snippet, not an essay | E | an assistant turn asking for console output holding >1 fenced block or >N prose lines | transcript turn-shape assertion (fence count, prose lines) |

## static-website — `packs/static-website/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Published file is one the publish set names | C | added `\.(html|css|js|json|svg|png)$` under `publish_root` matching no `publish_paths` prefix while `site.config` unchanged | work assertion: added paths covered by a parsed key-value list |
| 2 | The version moves with the change | X | — | `sw/version-bumped`, `sw/version-scheme` |
| 3 | Pipeline files are managed copies of stubs | B | DERIVE: vendored `.github/workflows/static-site-*.yml`, `.github/actions/{read-site-config,bump-site-version,assemble-site}/**`; ASSERT: each byte-equals its `.claudinite/shared/packs/static-website/stubs/` twin | `requireFilesEqual` (pair by relative path); `sw/release-workflows` checks presence only |
| 4 | Site served from a subpath | A | `relevantWhen pathAbsent CNAME`; `matchLines /(href|src)=["']\/(?!\/)|fetch\(\s*['"]\/(?!\/)|url\(\s*['"]?\/(?!\/)/` over the publish set | none |
| 5 | Freshness is a published manifest's job | G | design guidance; no artifact signature until a manifest exists | none |
| 6 | Nothing attests to its own freshness | A | `matchLines /fetch\([^)]*manifest[^)]*\)/ unlessLineMatches /no-store|Date\.now|\?v=/`; `matchLines /content-length|\.size\s*[!=]==/` in cache code (advisory) | none |
| 7 | Two files on separate clocks joined across generations | G | design guidance; the join-rate assertion is a judgment on the data | none |
| 8 | Don't call missing data survivable | F | trigger: added line `/\.catch\(\s*\(\)\s*=>\s*(null|undefined|\{\}|\[\])\s*\)|\?\?\s*\{\}/` on a fetch → "follow it to the pixel" skill | added-line-pattern skill trigger (as html-2) |

## product-wiki — `packs/product-wiki/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Working on a requirement or spec | E | Edit/Write under `**/product-requirements/**` or `requirements/**` with no earlier Read/Grep under `product-wiki/` in the transcript | transcript tool-sequence assertion (edit without prior read, by path) |
| 2 | Building on product-wiki elsewhere | X | — | `product-wiki-isolation` |

## leaflet — `packs/leaflet/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Feature-detect an optional plugin | A | `checkEachFile whenFileMatches /L\.markerClusterGroup\(/ require /typeof\s+L\.markerClusterGroup/` (one entry per plugin: heatLayer, Control.Draw) | none |
| 2 | Mid-page map scrollWheelZoom:false | A | `matchLines /L\.map\(/ unlessLineMatches /scrollWheelZoom/ unlessIndentedBlockBelowMatches /scrollWheelZoom/` (advisory) | none |
| 3 | Keep tile attribution; real maxZoom | X | attribution half carried; maxZoom tail A: `matchLines /maxZoom:\s*(2\d|[3-9]\d)/ whenFileMatches /tile\.openstreetmap\.org/` | `leaflet/tile-attribution` |
| 4 | Marker transform on inner element | B | DERIVE: `className` values of `L.divIcon({…})` calls; ASSERT: no CSS rule for that class sets `transform:`; single-pass tail: `matchLines /\.leaflet-marker-icon\b/ andIndentedBlockBelowMatches /transform\s*:/` | `extractValueSets` from regex captures + negative join over CSS |

## python — `packs/python/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Heavy/native/ML dependency → optional extra | C | `pyproject.toml` base-vs-head: `[project].dependencies` gains a name from a heavy list (torch, tensorflow, numpy, scipy, opencv-python, transformers) | TOML parsed pairs in work scope + `forbidAddedValueInArray` over TOML |
| 2 | Wrapping a heavy backend behind an interface | G | architecture; lazy-import half already X `python-optional-import-top-level`; stdlib twin's existence has no signature | none |
| 3 | Probe import needs noqa F401 | A | `matchLines /^\s+import\s+\w+\s*$/ andWithinBlockOpenedBy /^\s*try:/ unlessLineMatches /noqa: F401/` where the except sets a flag (advisory) | none |

## play-store-release, android, app-store-release, ios — prose-less stubs

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| — | stub packs, no rules captured yet | — | — | — |

## aws-sam — `packs/aws-sam/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | esbuild must be a regular dependency | X | — | `aws-sam/esbuild-dependency` |
| 2 | CloudFront won't forward Authorization via custom policy | X | tail A: `matchLines /OriginRequestPolicyId:\s*216adef6-5c7f-47e4-b989-5492eafa07d3/` (AllViewer forwards Host → 403) | `aws-sam/cloudfront-authorization` |
| 3 | Deploy role must drive transform and CloudFront | A | IAM docs/templates: `matchLines /AdministratorAccess/`; `checkParsedFiles … requireValueInArray Statement[].Action "cloudformation:*"` | array fan-out (`Statement[]`) on the assertion side |
| 4 | Brand-new account can't create CloudFront | G | account-level gate; no artifact | none |
| 5 | Failed first CREATE must be cleaned up | E | Bash `sam deploy` whose output carries `ROLLBACK_COMPLETE|REVIEW_IN_PROGRESS`, then another `sam deploy` with no `delete-stack` between | transcript tool-sequence with output-pattern predicate |
| 6 | HTTP API rejects chrome-extension origin | A | `matchLines /chrome-extension:\/\// andWithinBlockOpenedBy /AllowOrigins:/` in `template.ya?ml` | none |
| 7 | CDN cache hit served before authorizer | G | design; no per-line signature | none |
| 8 | Short TTL over per-write invalidation | A | `matchLines /createInvalidation|CreateInvalidation|create-invalidation/` in source and workflows (advisory) | none |
| 9 | Bundle the SDK; pin a non-EOL runtime | A | `checkParsedFiles template forEachEntryAtField Resources whereEntryFieldEquals Type AWS::Serverless::Function requireField Properties.Runtime`; `matchLines /Runtime:\s*nodejs1[0-6]\.x/`; `matchLines /^\s*-\s*['"]?@?aws-sdk/ andWithinBlockOpenedBy /External:/` | none (Globals fallback is a second entry) |
| 10 | Review the change set — Replacement True hard stop | D | Bash `sam deploy` lacking `--confirm-changeset|--no-execute-changeset` → warn; termination protection stays prose | PreToolUse Bash command-shape guard vocabulary |
| 11 | Adding a DynamoDB GSI does not backfill | C | `template.ya?ml` base-vs-head: entry added to `GlobalSecondaryIndexes` of an existing `AWS::DynamoDB::Table` → advisory | `forbidAddedValueInArray` for YAML, object entries keyed by `IndexName` |
| 12 | Custom request header makes GET preflighted | B | DERIVE: custom header names in client `fetch(…, { headers: {'X-…'} })`; ASSERT: each in template `CorsConfiguration.AllowHeaders` | `extractValueSets` from regex captures + `requireIndexCoverage.coveredByValueInArrayAtField` on YAML |
| 13 | Reach AWS via the CLI; declare its install | H | the install belongs in the pack's `env` declaration (pack.mjs has none); "no AWS MCP tool" half is knowledge | re-home: `env: { setup: 'pip install awscli' }` |

## claudinite-fleet-sheepdog — `packs/claudinite-fleet-sheepdog/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Keeping a repo out of the fleet | H | describes the `exclude` config key; instructs no decision | re-home to pack README |
| 2 | Adding or changing a packSeeds entry | F | trigger: work-scope change to `.claudinite-settings.json` `packSeeds` (parsed base≠head) → "land together, read next report" skill; agree half X `fleet-pack-seed-agrees` | work-scope field-change skill trigger |
| 3 | Declaring a pack this fleet also seeds | X | — | `fleet-pack-seed-agrees` |
| 4 | Acting on an add-packs work-list issue | F | trigger: work item of task `fleet-add-missing-packs` / issue titled `add-packs` read via `issue_read` | task-kind / issue-title skill trigger |
| 5 | Acting on a scanned pack suggestion | F | trigger: issue carrying the scan's label/title (`scan-for-needed-packs`) | same |
| 6 | Reading unknown in a report | F | trigger: reading a fleet report (`fleet-status` issue, `sheepdog/fleet-status` output) | same |
| 7 | Judging whether a member is behind | E | assistant text asserting "behind/stale" citing `ref`/`updated`/"days old" without `engineVersion|packVersions` | transcript assistant-text pattern |
| 8 | Answering why the fleet did not move | F | trigger: owner phrase `/why (did|has)n?'?t .*(fleet|mount|member).*(move|update|converge)/` → diagnosis skill (shared with lifecycle-8) | prompt-phrase skill trigger |
| 9 | Pushing canon to the whole fleet now | F | trigger: owner phrase "baseline / push canon to the fleet" → skill holding the command recipe | skill (how-to out of RULES) |
| 10 | Adding a pack across the fleet | F | trigger: owner phrase "add pack X across the fleet / to every repo" | skill |
| 11 | Granting or repairing FLEET_GITHUB_TOKEN | F | trigger: writing the token handover issue / `fleet-token.mjs` missing-permission report | skill (writing-handover-issues) |
| 12 | A sweep reporting 403 or no-permission | E | fleet dispatch → output `403|no-permission` → the same dispatch repeated | transcript tool-sequence with output predicate |

## claudinite-lifecycle — `packs/claudinite-lifecycle/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Never edit under .claudinite/shared/ | D | Edit/Write/NotebookEdit path `^\.claudinite/shared/` → block; Bash `sed -i`/redirect to it → block; C backstop: changed files there on a non-`claudinite/` branch | declared PreToolUse path guard (block) + work `forbidChangedFilesMatching` |
| 2 | Mounted skill links resolve against canon path | D | Read of `.claude/skills/<name>/<not SKILL.md>` → warn naming `.claudinite/shared/packs/<pack>/skills/<name>/` | PreToolUse Read-path guard with rewrite hint |
| 3 | Rules apply only by declaration | G | knowledge; the act is adopt-pack's (X) | none |
| 4 | Adding a pack — run adopt-pack | X | hand-copy tail D: Bash `cp .*\.claudinite/shared/packs/` → block | `adopt-pack` skill (description trigger) |
| 5 | Setting a project up for the first time | X | — | `adopt-claudinite` skill |
| 6 | Deciding which pack owns a lesson | F | trigger: edit under `**/packs/*/RULES.md` (already force-loads `writing-pack-prose`) / extract-from-* skills → carry the directory read there | move into writing-pack-prose / extract skills |
| 7 | Judging whether Claudinite is current here | E | assistant text citing `claudinite.updated`/`ref` age as currency; F tail: owner phrase "is claudinite current/stale" | transcript assistant-text pattern; prompt-phrase trigger |
| 8 | Answering why the mount did not update | F | trigger: owner phrase (same as sheepdog-8) → diagnosis skill | prompt-phrase skill trigger |

## claudinite-growth — `packs/claudinite-growth/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Recording a local pack change — no changelog | A | forbid tracked `.claudinite/local/packs/*/(VERSIONS|CHANGELOG)\.md`; canon half is the canon-curation pack's version tasks | `forbidTrackedPathsMatching` |
| 2 | Wanting a job to run in Actions — make a task | D | Write to a new `.github/workflows/*.ya?ml` not a vendored stub name → warn "make it a task"; C backstop: added workflow file | PreToolUse Write-path guard (warn) + work `forbidAddedFilesMatching` |

## claude-code-web-users-support — `packs/claude-code-web-users-support/RULES.md`

| # | Rule | Class | Signature / trigger / derived set | Needs |
|---|------|-------|-----------------------------------|-------|
| 1 | Person asking to change a personal preference | F | trigger: owner phrase `/(my|personal) preference|I prefer|remember that I/` → skill routing to `<email>.md` in the store repo; D backstop: Edit of `CLAUDE.md`/`RULES.md` that turn → warn | prompt-phrase skill trigger |
| 2 | Recording preferences with no file yet | X | in the store repo the name is checked; F tail as rule 1 | `preferences-store-file-names` |
| 3 | Web session halt-gated on toolchain | X | — | `engine/pack_loader/env-requirements.mjs` halt directive already instructs the re-paste |
