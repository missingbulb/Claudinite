# Claudinite — the canon's own non-portable working rules

Lessons specific to working on the canon itself. Anything true for repos beyond this one belongs in
the shared canon under `packs/`/`skills/` instead. The `growth-extract` task appends here, each
lesson at the strongest mechanism available — a check where the rule is deterministic, else prose.

Keep each rule near 40 words: the trigger, the directive, and a consequence clause only where the
rule cannot be applied without it. Split a rule that carries two situations; the evidence it came
from lives in `VERSIONS.md` and the issue, never here.

## Standing owner decisions — settled, do not re-litigate

- **Wanting a rule about what the `packs/` tree may reference** — declare and configure the
  `barriers` pack, extending it generically if a capability is missing. Never standalone
  segregation-checking code.

- **Writing a `docs/<initiative>/DESIGN.md`** — the end state and its rationale only, with
  alternatives and their drawbacks. Never requests, prior-state narrative, or owner opinions.

- **Recording a migration's plan, status or remaining work** — the tracking issue, never a
  `MIGRATION.md` beside the design (`writing-migration-plans`).

- **A `docs/<initiative>/DESIGN.md` whose system is now built** — delete it whole rather than trim
  it. Verify each section already lives in a module header or pack `README.md` first, and move an
  owner-decision record with its rationale. Leave a doc describing work in flight alone.

- **Sweeping a deleted design doc's `§`-numbered pointers** — re-point each at a pack README, or
  drop it where the sentence only cited itself.

- **Ending a session on unfinished work** — write the state into the tracking issue; the owner's
  opener is `continue work on #<n>`. Never compose a hand-off prompt.

- **Designing anything that spans repos** — split it: a self-contained per-repo half in the canon,
  the aggregation half as a Shepherd fleet task. No repo list lives in canon code.

- **Landing a derived fleet artifact** — a daily auto-merged PR of a `GENERATED` file in Shepherd,
  never a commit to its `main`.

- **Choosing a value right for nearly every project** — keep it in the pack's own code: ask
  nothing at adoption, write nothing into member config. Read config as optional; unset means the
  default, never "misconfigured".

- **Needing a member to flip a platform setting** — last resort; per-repo manual work reliably
  does not happen. Prefer the route that works with the Action's own `GITHUB_TOKEN`, or neutralise
  the blocking behaviour's effect rather than asking for a reconfiguration.

- **Requiring a credential nothing weaker can replace** (`FLEET_GITHUB_TOKEN`) — name the exact
  scope, and have the automation report when it is missing rather than degrade silently.

- **Landing a change to what members receive** — force delivery only where *"will it work on every
  repo?"* is live: engine flow, a contract member files must satisfy, a stub, a migration record, a
  new config key. Otherwise the nightly converge is the delivery.

- **Forcing fleet delivery** — drive Shepherd's `fleet-baseline` with `follow`, report per member
  unasked, and attach the repos verification needs. A dispatch is not a result; 204 means queued.

- **Retiring a field, option or module** — `@deprecated` on its definition, plus a comment at each
  sanctioned holdout saying why it still carries the field. Never a bespoke conformance check for a
  deprecation; keep the contract validating it.

- **Wanting a `.claudinite-settings.json` entry's config validated** — a real JSON Schema the file
  points at with `$schema`. Never a coded per-pack validation vocabulary or a `configSchema` type
  system on the manifest.

- **Wanting to share logic between two sibling packs** — never `engine/`, which breaks the
  package-manager model, and never a pack-to-pack dependency, which breaks independence. Prefer
  self-describing data; else duplicate, possibly with a drift guard.

- **Surfacing a number a human reads as a report card** — report a window against the previous
  window. Never a monotonic cumulative total, never a figure nothing measures.

- **Lacking a field a report-card number needs** — name it absent in the surface's own note. A
  stated gap is information, a guess is not.

- **Windowing a count** — only where it is built from things that happened inside the window. A
  figure derived from a point-in-time stamp reads a steady population as declining.

- **Classifying an open object by deriving it from other live state** — reconsider once the
  derivation's own inputs can mutate while the object stays open, silently reinterpreting its
  history. Prefer a marker stamped once at creation and never revisited.

- **Scheduling the removal of a temporary compatibility tolerance** — gate it on a
  converge-cycle-confirmable precondition ("no member still stamps the legacy format"), never a
  calendar date alone.

## Working with the owner and the session's tools

- **Answering "why did it fail?"** — lead with the throwing call site: `file:line`, the function,
  and which side enforced it. A narrative that never names the line reads as unanswered.

- **Reaching for `AskUserQuestion`** — it blocks ~170s, so spend it only on a fork you cannot take
  back. Anything answerable from the instruction, the tree, or a reversible default: answer it,
  act, and say what you assumed.

- **Wanting to re-post a question the owner declined** — don't. Take its recommended default, or
  open the question up.

- **Asking about a vague, destructive-sounding instruction** ("remove the entire mechanism") —
  scope the question to the boundary of the vague noun itself, not the consequences of one reading
  of it.

- **Being asked to generalise something, or to review it** — land the conversions or action points
  it unlocks in the same change. A capability ships with its first caller, an analysis with its
  first recommendation applied.

- **Calling anything on `Claude_Code_Remote`** — one call per intent, ever. Each costs minutes,
  and a call that returns nothing has not failed; the retry has run to 81% of a session's tool
  wall-clock.

- **Wanting to read a public sibling repo** — `git clone --depth 1` (~2s). `add_repo` attaches
  nothing the git proxy does not already serve.

- **Waiting for something to happen** — the guard must name the condition awaited: a run's status,
  a file's arrival, a deadline. No trailing padded `sleep`. A guard you wouldn't write as the
  *whole* test means you are sleeping and calling it polling.

- **Waiting on GitHub CI or PR check status** — read the head sha's check runs with the GitHub MCP
  tool, on a rolling backoff. This sandbox proxy-blocks `api.github.com`, so `Monitor` and shell
  poll loops report "still running" until they time out.

- **A `mcp__github__*` list/search/read call with no narrow `fields`/`per_page`** — risks a
  >25k-token single-line dump. The saved tool-result file is one unbroken line, so `Read`'s
  `offset`/`limit` won't shrink it; parse it with `python3 -c 'json.load(...)'` or `jq` instead.

- **Re-waiting on a signal that already failed to move** — read the code that governs when it
  *can* change before waiting a second time on the same premise.

- **Writing a step a human must do by hand into an issue** — make sure it is needed; a checklist
  of no-ops teaches the reader to skim it. Link the deepest existing settings URL rather than
  writing out a breadcrumb trail.

- **Replying to an owner comment that raises more than one claim** — answer every claim in that
  first reply, including the one you intend to push back on.

- **Repeating a design doc's stated architectural rationale** — verify each claimed ground against
  the current code first. "A task structurally cannot hold this permission" is false: code-work
  runs inside the executor's own Action job.

- **An owner reversing a standing decision** — purge every place in the repo that still states the
  old decision (docs, comments, code defaults) and record the new one where a future session reads
  it. Answering the prompting question alone is not the fix.

- **Sending a screenshot rendered from a scratch test harness** — say so in the caption, not just
  what the widget shows.

## Authoring packs, prose and checks

- **Writing anything into a pack's `RULES.md` that describes rather than instructs** — how a
  mechanism works, or what the pack's own tasks do — not there, where every session in every
  declaring repo pays for it whether or not it is that session's work. Description belongs in the
  module header and the pack `README.md`; a worker's policy belongs in the `task.md` it loads.

- **Deciding whether a line earns its place in `RULES.md`** — the test is whether an agent could
  act differently for having read it.

- **Having a deferred direction, blocked proposal or status to record** — `docs/`, pointed at from
  the issue or PR. Never a pack file: `docs/` is outside the vendor set.

- **Naming a new canon pack** — kebab-case, named for the surface it serves rather than the first
  feature you are building for it. The directory name is the public id every member declares, so
  another casing costs a fleet-wide rename.

- **Naming a pack whose subject is a Claudinite feature itself** — the `claudinite-` prefix
  (`claudinite-lifecycle`, `claudinite-dashboard`). `claudinite-growth` is grandfathered.
  (convertible → prose-to-checks)

- **Starting a new Claudinite-facing capability** — decide which distribution model it is before
  writing the first file: a member-local tool, always-on engine code, or an opt-in pack with its
  own adoption. Nothing prompts this choice, and getting it wrong costs a move-and-rewrite cycle.

- **Looking for a skill and not finding it in `.claude/skills/`** — read
  `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree. Mounting filters on the literal
  declaration, so an unmounted skill says nothing about whether its procedure applies.

- **Adding or changing a check** — update the pack's catalog row, and re-run the suite against
  current `main` before merging: a whole-tree aggregate is judged post-merge, so a branch's own
  green never covers it. (portable → `merge-to-main`)

- **Wanting to state how many checks or rules the corpus has** — don't. `packs/README.md` states
  how to count them instead of quoting a number.

- **Writing a check's `fix` text** — name only remedies matching the enforced severity; sessions
  follow the words, not the `severity` field. An advisory's remedies are act on it or leave it,
  never a config-acceptance escape.

- **Declaring a check, or adding a key to the vocabulary** — name the key so the declaration reads
  alone (`scanFiles`, `matchLines`, `relevantWhen`). If it needs a comment to be read, it needs a
  better name.

- **Wanting prose in a check declaration** — there is none. `packs/<pack>/declared-checks.json`
  holds no `description` and no comment; the line the agent reads is `failureMessage`.

- **Writing a check that reads the session transcript** — screen the harness's plain-text
  pseudo-turns, not only tag-wrapped ones. `humanText` in
  `engine/checks/helpers/session-transcript.mjs` drops an entry starting with `<`, so a marker
  like `[Request interrupted by user for tool use]` reads as the owner's latest comment.

- **Fixturing a check that fires at the Stop hook** — carry an interruption marker beside a real
  owner turn. A false positive there spends a whole cycle on something no edit can clear.

- **A doc reached only by following a link out of `RULES.md` or a check's `doc:` line** — if it is
  a how-to wanted at authoring time, convert it into a skill invocable by description.

- **Moving or renaming a file a check's `doc:` field points at** — grep for and re-verify every
  `doc:` by hand. Nothing opens the field until the check fires, so a stale pointer sits broken
  indefinitely.

- **A check built to catch a thing being missing or misnamed** — don't gate its relevance on the
  single signal it exists to validate, or the failure it catches also silences it. Use two
  independent signals, either sufficient.

- **Deciding whether an enforced check still earns its keep** — measure its blocking-firing rate
  against what it buys. A check whose firings are dominated by cases where the agent already did
  the right thing is a demotion candidate (check → prose-only).

- **A documented multi-step procedure the agent re-derives every run** — mechanize it into a
  script the agent runs once. That pattern, not the doc's polish, is the signal.

- **Creating the artifact a check will demand** — create it before the action it gates, not after.

- **A canon pack's prose naming another pack by literal path** — check the name resolves inside
  every consumer's vendored tree. `.claudinite/local/packs/<pack>/` exists only in the canon home,
  so naming a home-only local pack dangles everywhere else it mounts.

## The engine, the mount and what reaches members

- **Editing `claudinite-scheduler.yml` or `claudinite-executor.yml`** — nothing beyond triggers,
  permissions, concurrency and the `run:` line naming an engine module. A converge cannot push to
  `.github/workflows/`, so logic left there costs a fleet-wide PR to change.

- **Moving a scheduler workflow's program out** — into `packs/claudinite-tasks/queue/`, leaving a
  single-line `run: node <module>`, and edit both copies — the stub and the canon's own — in the
  same commit. `scheduler-workflows-are-thin` blocks the two shapes it can see.

- **Writing a path, regex or command against the mount** — the two-root form: the
  `.claudinite/(shared|local)/` prefix optional in a pattern, and a probe for `.claudinite/shared/`
  falling back to the repo root. The home runs the same code from the repo root.

- **Adding a module under `packs/`** — keep it import-light, and start work after evaluation
  completes (`check(…).catch(…)`), never in a top-level `await`. Discovery imports every
  `pack.mjs` before activation is consulted, so a CLI entry point re-imports mid-evaluation and
  Node exits 13. `pack-discovery-entry-await` enforces the await half only.

- **Tightening a contract member-owned files must satisfy** — first ask what carries it across the
  fleet. Vendoring refreshes `.claudinite/shared/` only and a migration record moves paths, not
  schemas; if nothing carries it, accept the legacy shape in `normalizeManifest`.

- **A stale member declaration** — fail the run. Never let it degrade to *fewer checks running*.

- **Renaming a pack whose config a member writes into their own repo** — a reader of that config
  resolves the new key and every legacy spelling, permanently. The rename map fixes code-side ids
  only; rewriting the write side reaches just the data the engine owns.

- **Checking whether an actor may trigger a privileged action off an issue/PR payload** — read
  `GET /repos/{o}/{r}/collaborators/{u}/permission`, never `author_association`: `MEMBER` covers
  any org member and `COLLABORATOR` includes read-only ones, both broader than push access.

- **Extending what a copied stub reads** — make the new config key optional, fail the run when it
  is declared-but-unset, and let declaring it trigger a staleness check. Stubs are copied once and
  never re-copied, so a new key is dead in every repo holding the old copy.

- **Writing a migration record that needs engine behaviour newer than itself** — have `appliesTo`
  probe the member's own mount for that capability by content, and stay inert until it reads back;
  an unreadable mount reads as "not capable". The executing worker is the member's vendored one.

- **Changing an export in `updates/*`** — empty it, never remove it, and say at its definition
  why. Fielded workers are stale callers of instantly-current flow modules, so a removal wedges
  every member permanently on its next run.

- **Retiring an emptied `updates/*` export** — read the field: the condition is that no member's
  *vendored* worker calls it. Pin the surface with a test carrying an expiry; the canary rehearsal
  cannot catch this class.

- **Renaming or deleting an `engine/` module a `packs/` file imports** — leave a shim at the old
  path re-exporting what it named. The two lanes deliver on separate cycles, so every member spends
  a window holding the NEW engine beside an OLD pack.

- **A pack that fails to load** — it fails the mount's self-test, the converge refuses to land at
  all, and the member cannot receive the pack version that would have fixed it.

- **Asking which imported symbols are still fielded** — walk the TRUNK's pack history, never
  `--all`. An import that only ever existed on an unmerged branch is not fielded.

- **Changing a vendored stub** — edit the canon's own `.github/workflows/` copy in the same commit
  and diff the two whole files. The canon has no converge, so its copy drifts invisibly until it is
  a permission denial in production.

- **Excluding files from the vendor set by pattern** — whitelist any operational file that matches
  by path, and pin it with a test against the real canon tree. The nightly refresh re-runs from
  canon HEAD, so a bug there is the one canon regression that is not self-healing.

- **Testing that an operational file still vendors** — assert the whole containing directory, not
  the one file that broke; otherwise the next file added there needs a fresh edit.

- **Retiring or reshaping a protocol the engine exposes** — sweep for callers outside this repo,
  not just what greps locally. Two stub copies at the same path declaring different input names is
  the same failure from the other side: the two spellings *are* the protocol.

- **Branching on the result of an API write in fleet machinery** — read its status, not just the
  body. A body-only destructure turns a 403 into a plausible object and the run still logs `ok`.

- **Judging whether fleet delivery worked** — members' stamps, never run conclusions. The stamp is
  the only artifact that moves.

- **A single timeout bound covering two different waits** ("has this started" vs "is something
  already running about to finish") — split it, sized from each phase's own declared budget rather
  than a round number.

- **Writing a give-up message for a hit timeout** — say it is a statement about the clock, not a
  verdict on the work. "No successful run yet" sends a reader chasing a settings diagnosis for CI
  that was simply still running.

- **Writing generated content into a size-capped GitHub API field** — budget it in two tiers: an
  always-complete compact summary, plus best-effort detail rationed to a byte budget with an
  explicit omitted-count. An unbounded write 422s at the ~64KB cap.

- **Writing a generated title whose content scales with a list** — collapse the list to a count
  and keep per-item detail in the body. A title is a summary surface, not a second body.

- **Preflighting a required grant or permission** — a probe run where the failure's condition
  isn't met reports a false-positive pass. Prefer attributing a real observed 403 to the
  permission that would fix it.

- **Introducing a finer-grained classification of a catch-all state** — default whatever an older
  or unaware writer produces to the most conservative member of the new set, so it fails safe
  instead of landing in a lane nobody watches.

- **Adding a fleet task** — fail loudly on a Context target it cannot reach rather than proceeding
  on a partial list, and treat a member as un-adopted until the routine's repo scope names it.
  Otherwise the drift completes, filing a report that reads as a full sweep.

- **Spawning a child process from a worker** — pass an explicit `cwd`, resolved to a root that
  cannot vanish (`--root`, then `CLAUDE_PROJECT_DIR`, then `cwd`). The converge deletes the tree
  its own code-work runs inside.

- **A worker crash sharing a benign outcome code** — keep "could not run" distinguishable from
  "had nothing to run", or it is unobservable.

- **Diagnosing a member's maintenance PR that won't land** — `unstable` beside a green sweep is a
  parked `action_required` run, not a missing repo setting.

- **Reading a uniform signal across every fleet member** — check for a rate-limit signal before
  trusting a uniform empty sweep, and check whether each member's own convergence window has passed
  before calling the fleet frozen.

- **Corroborating a theory with a signal already known unreliable** — don't. An uncorrected "the
  entire fleet is frozen" claim stood for ~10 hours.

- **Retiring or migrating a dispatch/config parameter channel** — a parameter that stops being
  read must fail loudly, never silently default. A dropped safety knob (`DRY_RUN`) defaults to the
  operation's most dangerous mode.

- **Relying on a push to trigger further Actions workflows** — a push authored with the default
  `GITHUB_TOKEN`, which every converge and auto-merge here uses, fires no `on: push` workflow. Only
  a real user or app credential cascades.

- **A workflow file referencing a renamed entry point by literal path** — hold a shim open, as for
  an `engine/` module a `packs/` file imports. `.github/workflows/` lands only through a PR a human
  merges.

- **A script written for one execution context** — audit every script's environment assumptions (a
  real `GITHUB_TOKEN`, `gh`/`curl` reachability) whenever its caller's context changes. Every
  script built against the old assumption fails identically, not just the one that broke first.

- **Finding a check that watches only one of two structurally-identical surfaces** — widen it to
  the sibling in the same change rather than filing it separately.

- **Picking a compact date-encoded identifier** — check the encoding's rollover boundary years
  ahead, not just today's decode. Anchoring a year on its last digit wraps to 0 in 2030; use
  `year - 2020`, not `year % 10`.

- **Carrying a dotted version identifier** — keep it string-typed everywhere. `'60820.10'` and
  `'60820.1'` are different versions and the same float.

- **Designing text that instructs a model to echo an exact string** — state the instruction first,
  have it disclaim itself as instruction-not-payload, and put the literal string once, last. Never
  reference the payload anaphorically ("that line"); recency is what resolves it.

- **A work-scope check that verifies "this PR bumped X" by diffing against `main`** — on a stacked
  PR that diff carries the lower PR's bump and passes green wrongly. Re-verify and re-bump after
  every earlier PR in the stack lands (`pack-version-bumped`).

## Scheduled tasks

- **Opening a queue work-item's own delivered PR** — never `Closes #<the item's own issue>` in
  the body. `converge-item.mjs` closes or parks that issue with the right label state; the native
  keyword fires on merge regardless and overrides an intended `needs-human-approval` park.

- **Choosing a task's cadence** — take it from how often the signal actually moves. A weekly run
  still sees all 7 days, because a task's signal window is its own period plus an hour of slack.

- **A precondition that fires nearly every night** (one reading `sharedMount`) — daily buys noise,
  not freshness, and spends an opus session each time. Prefer weekly where the work isn't
  latency-sensitive.

- **After any scheduler-mechanism flip** — re-audit every task whose precondition assumed the old
  mechanism; grep for `frequency: 'manual'` plus its precondition text, not just the flipped
  mechanism's callers. A stale `run: false` becomes a live self-closing landmine.

- **Writing a task's precondition** — gate on the objects' own movement in the window (a `touched`
  list, a tip-commit date), never on standing state, which is true forever once true. (portable →
  `claudinite-growth/skills/writing-tasks/SKILL.md`)

- **A precondition signal that is true most days** — let it only *widen* an already-triggered run.

- **Scoping a task whose verdict is relative to the rest of a set** — the gate is not the scope:
  newness gates, and the full set stays the scope.

- **Writing a task whose output is a regenerated file** — land it through
  `packs/claudinite-tasks/deliver-generated.mjs`, reading prior state from the fetched base, not local
  HEAD. (`basics/baselining` is the deliberate exception.)

- **A worker that checks out a branch or leaves an index behind** — one executor run drains
  several items from one checkout, so it hands the next item a tree it did not expect.

- **Wanting to exercise a task Action-side** — dispatch the scheduler workflow with its `wake`
  input naming the task; the post-scheduler drain picks it up in the same run. The precondition
  still runs at pickup, so a wake that finds no work says so — a verdict, not a failure.

- **Converging an unattended run** — do the label/comment/close sequence as the run's very next
  action once the outcome is known, never deferred to a checklist recalled at the end of a long
  session.

- **Closing a run `outcome:done`** — it means nothing is left for anyone to act on. Never while a
  PR, branch, or open question from this run is still live.

- **Decomposing a pipeline into chained tasks** — chain stages by preconditions that each
  re-derive the world's actual state, never by parameters passed forward. A run interrupted
  mid-pipeline then self-heals on the next pick.

- **Setting `on_interrupt: 'needs-human'`** — narrow it to the one stage whose side effect is
  genuinely non-idempotent.

- **Passing a diagnostic verdict out of a subprocess that may be killed at its timeout ceiling** —
  write it to stdout/stderr, never a file written at exit. Already-printed output survives a
  `SIGKILL`.

- **Writing a repair rule over a live, mutating collection** — a rule gated on *current state*
  needs a fresh, targeted read of the item immediately before acting, never the snapshot that
  triggered the sweep. A rule gated on a *clock* is safe against snapshot staleness.

- **Solving a "must act again later" problem** — check whether an existing generic lane already
  carries it before building standing machinery. The deferred-request queue's
  `Blocked-by`/`Not-before` lane does.

- **Building a dedup or mutex over work items** — key the guard on the target the write lands on,
  never the requester's phrasing. A same-title match is blind to two items writing one target under
  different titles; `Blocked-by:` is what serializes them.

- **`converge-item.mjs` fails with `GITHUB_REPOSITORY is not set` or a 401/403** — this session's
  GitHub access is MCP-only; only `packs/claudinite-tasks/` code legitimately holds a real
  `GITHUB_TOKEN` (stated in `signals/gh.mjs`'s header, not in `queue/instructions.md`). Don't
  hand-fabricate the transition via `issue_write` — the dependents-release chain is easy to drop,
  and a label-only close leaves the issue open wearing its outcome label (live on #1220, #1265).
  Report and leave it unconverged instead.

## Proving a change

- **Testing a change to a task's triggering** — drive the real `planSchedulerRun` from a clock at
  which the task's anchor has NOT come. Instantiation is decided before any precondition runs, so
  starting from a queued item proves only "works once instantiated".

- **Testing a fail-soft step** — assert the positive effect (the output IS emitted), never
  `status === 0`, which fail-soft makes meaningless. The engine is vendored verbatim, so one
  regression disables that step fleet-wide.

- **Writing a check that selects inputs by path pattern** — assert over the real tree that its
  scope is non-empty. A pattern left behind by a layout change matches nothing, reads as live, and
  fixtures spelling the same dead layout keep proving the matching.

- **Naming a directory in a finding, a remedy or a doc pointer** — grep the tree for it before
  shipping.

- **Testing a helper reapplied across a hand-off, a re-queue or a retry** — call it twice and
  assert no duplication. A suite of single-call tests stays green while the multi-call case
  corrupts state.

- **Testing a mechanism that arbitrates by identity** (a claim, a lock) — the second call must
  come from a *different actor*. One actor retrying its own stale claim can't expose an
  identity-masked race.

- **Building a simulator for a stateful engine mechanism** — model what the engine's code actually
  *writes*, never the rule's stated *intent*. A sim advancing state wherever the rule's description
  matches is correct by construction and blind to where the two diverge.

- **Asserting a mid-run invariant** — capture it at the exact moment the state holds. By the end
  of the run, normal convergence has cleared the evidence.

- **A test that derives its answer by walking git history** — guard explicitly against a shallow
  clone and fail loudly. It otherwise passes vacuously exactly when the real answer needs history
  it doesn't have.

- **Restoring source after a deliberate see-it-fail mutation** — `git checkout -- <file>` at the
  moment of mutating, never a `.bak` taken earlier, which predates whatever else you edited in
  between.

- **Mutating a file to see a check fail** — commit or stage the real edit first, and only mutate a
  file whose current state you are ready to throw away. `git checkout --` restores from the index,
  destroying uncommitted work just as thoroughly.

- **Running the test suite** — `node --test $(git ls-files '*.test.mjs')`. There is no test
  script, and every hand-written glob under-runs it silently: `node --test <dir>` doesn't recurse,
  and bash `**` without `globstar` reached 37 of 65 files. `ci.yml`'s array is not authoritative.

- **Wanting a different slice of a suite run's output** — redirect one run to a file and grep that
  file. Never re-run the ~55s suite to re-slice unchanged output.

- **Certifying a run green that covers a new test file** — `git add` it first. `git ls-files`
  silently excludes an unstaged file, so the run may never have executed it.

- **Iterating on a sweep across many files** — run only the test files the edit touches, plus
  `check_the_work`. Spend the whole suite and `check_the_world` once, at the end: both are
  whole-tree aggregates whose verdict cannot turn on one file, and per-edit reruns took 25 of one
  session's 26 minutes of tool wall-clock.

- **Surveying whether something exists in the tree** — a code-search hit is evidence; a miss is
  not. Survey by reading each file.

- **Documenting or relying on a named knob** — grep for the code that reads it and the code that
  writes it first. The corpus naming it is not evidence it exists; all three misses are real here.

- **Deleting a writer** — it is the same change as marking its series historical. Its rows keep
  counting plausibly until the retention window ages out, then count nothing.

- **Renaming an entity** — sweep for references in code and comments, don't change historical
  records, and re-render generated files rather than editing them by hand.

- **Renaming a word that is also stored data** (a counter key, a wire word, a label) — rename it
  on the **decode** side too, or the next encode writes those historical counts as `null`,
  silently and only for the old rows.

- **A second rename of one name** — map every legacy spelling straight to today's, never chaining
  one normalization onto the last, so the oldest vocabulary still normalizes in a single pass.

- **Writing a "this period is covered" marker in an idempotent pipeline** — write it strictly
  after the durable effect it guards, and scope it to the *declined* case only. A go verdict's
  coverage is judged by the item it created, never by the row.

- **Verifying a bulk file-move or rewrite sweep preserved content** — check a structural invariant
  count before and after (total `test(` calls across the touched files). One sweep truncated 46
  test files to zero bytes and every one still "passed".

## Editing, branching and merging here

- **Making a throwaway probe commit on a scratch branch** — `git commit -am` stages every modified
  file, and a later `git branch -D` discards the real in-progress edits it swept up. Isolate
  pending edits first.

- **Editing a repo's JSON config** — patch it as anchored text; never re-serialize. A round-trip
  rewrites indent, key order and escapes while nothing fails and tests stay green. (portable →
  `repo-text-sweeps`)

- **A JSON target nested inside an array within an entry object** — parse and rewrite
  structurally, preserving key order and `via`/`config`/answers by hand. An anchored regex cannot
  cross the nested closing bracket, and a fixture without that nesting proves nothing.

- **Returning to a branch that waited** — after `git fetch`, re-verify the *premise* unasked: say
  whether the problem is still there and what survives. This repo auto-merges its own PRs on top of
  migrations that retire whole directories.

- **Re-verifying a branch against a `main` that has moved** — `git rebase origin/main`, never
  `git merge origin/main`. A merge commit trips the blocking squash-merge-history check.

- **After a PR lands by squash-merge** — `git remote prune origin` before touching that branch
  again. GitHub deletes the head ref here, so a stale tracking ref makes the next push reject and
  the stop hook report phantom local work.

- **Re-applying your edit onto a moved `main`** — re-read the fetched file, apply the same
  anchored edit, and confirm the stat shows insertions only. A pack's `RULES.md` is append-only
  and written several times a day, so a whole-file copy deletes those lessons and nothing goes
  red.

- **Syncing local `main`** — `git fetch origin main && git reset --hard origin/main`,
  unconditionally. The clones are shallow, so `git pull` finds no common ancestor; nothing of value
  is ever on this repo's local `main`. (portable → `git-github`)

- **Merging in a session that also has a consumer repo in its sources** — resolve the merge skill
  by *target repo*, not by which matched first. The consumer's wins on name, silently skipping the
  canon-only post-merge conversation capture
  (`node packs/claudinite-growth/capture-log.mjs --issue <n>`), which is part of the merge.

- **Having work that completes or corrects an open PR** — put it on that PR's branch. A dispatch
  prompt's designated branch routes work, not review; splitting gives the owner two gates for one
  decision.

- **Wanting to combine two PRs** — update the one you're keeping and close the other. Never push
  one's branch onto the other's base: GitHub marks a PR merged once its head is reachable, and a
  later `state: closed` is a no-op. Check the API's `merged` field before reporting.

- **Being asked "should no X decide this?"** — it questions whether the decision exists at all;
  never answer by relocating the knob one rung out. Ask who would set it differently and why that
  can't be read off the structure.

- **Facing a retry across a call whose outcome you cannot observe** — check whether declining to
  retry removes the uncertainty before building dedup machinery to manage it.

- **Writing a regex import-path rewriter for a bulk file-move** — anchor to real import/export
  syntax (line-start, or after a specific separator), never a bare `from '...'` searched across the
  whole text. A fixture embedding import syntax as string data matches identically and is corrupted.
