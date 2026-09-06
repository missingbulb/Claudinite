Below are rules on how to work on this repo.

## Standing owner decisions — settled, do not re-litigate

- **Writing a `docs/<initiative>/DESIGN.md`** — the end state and its rationale only, with
  alternatives and their drawbacks. Never requests, prior-state narrative, or owner opinions.


- **A `docs/<initiative>/DESIGN.md` whose system is now built** — delete it whole rather than trim
  it. Verify each section already lives in a module header or pack `README.md` first, and move an
  owner-decision record with its rationale. Leave a doc describing work in flight alone. (4)

- **Sweeping a deleted design doc's `§`-numbered pointers** — re-point each at a pack README, or
  drop it where the sentence only cited itself.

- **Having a deferred direction, blocked proposal or status to record** — `docs/`, pointed at from
  the issue or PR. Never a pack file: `docs/` is outside the vendor set.

- **Ending a session on unfinished work** — write the state into the tracking issue; the owner's
  opener is `continue work on #<n>`. Never compose a hand-off prompt.


- **Designing anything that spans repos** — split it: a self-contained per-repo half in the canon,
  the aggregation half as a Shepherd fleet task. No repo list lives in canon code. (5)

- **Landing a derived fleet artifact** — a daily auto-merged PR of a `GENERATED` file in Shepherd,
  never a commit to its `main`.

- **Needing a member to flip a platform setting** — last resort; per-repo manual work reliably
  does not happen. Prefer the route that works with the Action's own `GITHUB_TOKEN`, or neutralise
  the blocking behaviour's effect rather than asking for a reconfiguration.

- **Requiring a credential nothing weaker can replace** (`FLEET_GITHUB_TOKEN`) — name the exact
  scope, and have the automation report when it is missing rather than degrade silently.

- **Landing a change to what members receive** — force delivery only where *"will it work on every
  repo?"* is live: engine flow, a contract member files must satisfy, a stub, a migration record, a
  new config key. Otherwise the nightly converge is the delivery. (6)

- **Forcing fleet delivery** — drive Shepherd's `fleet-baseline` with `follow`, report per member
  unasked, and attach the repos verification needs. A dispatch is not a result; 204 means queued.

- **Retiring a field, option or module** — `@deprecated` on its definition, plus a comment at each
  sanctioned holdout saying why it still carries the field. Never a bespoke conformance check for a
  deprecation; keep the contract validating it.

- **Surfacing a number a human reads as a report card** — report a window against the previous
  window. Never a monotonic cumulative total, never a figure nothing measures. (9)

- **Lacking a field a report-card number needs** — name it absent in the surface's own note. A
  stated gap is information, a guess is not. (10)

- **Windowing a count** — only where it is built from things that happened inside the window. A
  figure derived from a point-in-time stamp reads a steady population as declining. (11)

- **Classifying an open object by deriving it from other live state** — reconsider once the
  derivation's own inputs can mutate while the object stays open, silently reinterpreting its
  history. Prefer a marker stamped once at creation and never revisited.

- **Scheduling the removal of a temporary compatibility tolerance** — gate it on a convergence
  window the change states for itself, never on a census of members: the canon cannot see which
  repos are active, inert or long stale, so "no member still stamps the old format" never reads
  true and the tolerance stands forever. (12)

## Working with the owner and the session's tools

- **Answering "why did it fail?"** — lead with the throwing call site: `file:line`, the function,
  and which side enforced it. A narrative that never names the line reads as unanswered.


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


- **Needing a session to read issues or PRs across several repos in one pass** — `add_repo`
  widens this session's own GitHub scope; unlike file content, issues aren't git refs, so there is
  no `git clone` substitute for reaching them.



- **Reading a tool result the harness saved to a file** — it is one unbroken line, so `Read`'s
  `offset`/`limit` won't shrink it; parse it with `python3 -c 'json.load(...)'` or `jq` instead.

- **Re-waiting on a signal that already failed to move** — read the code that governs when it
  *can* change before waiting a second time on the same premise.

- **Writing a step a human must do by hand into an issue** — make sure it is needed; a checklist
  of no-ops teaches the reader to skim it. Link the deepest existing settings URL rather than
  writing out a breadcrumb trail. (14)

- **Replying to an owner comment that raises more than one claim** — answer every claim in that
  first reply, including the one you intend to push back on. (15)

- **Repeating a design doc's stated architectural rationale** — verify each claimed ground against
  the current code first. "A task structurally cannot hold this permission" is false: code-work
  runs inside the executor's own Action job. (16)

- **An owner reversing a standing decision** — purge every place in the repo that still states the
  old decision (docs, comments, code defaults) and record the new one where a future session reads
  it. Answering the prompting question alone is not the fix. (17)


- **Running a Bash command with a `cd` outside the project root** — the *next* Bash call silently
  resets cwd back to the root ("Shell cwd was reset to …"), whether the first command succeeded or
  failed. Prefix every command touching that directory with its own `cd`; a prior one never carries
  forward.

- **Asserting why a system behaved a certain way** (a park correctly closed, a routing mechanism's
  logic) — read the primary evidence, the issue's own body/comments or the enforcing source line,
  first. A verdict inferred from structure or memory alone has shipped as a wrongly-merged fix for a
  bug that wasn't there.

## Checks and capabilities built here

- **Starting a new Claudinite-facing capability** — decide which distribution model it is before
  writing the first file: a member-local tool, always-on engine code, or an opt-in pack with its
  own adoption. Nothing prompts this choice, and getting it wrong costs a move-and-rewrite
  cycle. (19)

- **Declaring a check, or adding a key to the vocabulary** — name the key so the declaration reads
  alone (`scanFiles`, `matchLines`, `relevantWhen`). If it needs a comment to be read, it needs a
  better name.

- **Adding a legacy tolerance to `engine/` or `packs/`** — file the issue that removes it first,
  then put `// @legacy-tolerance advisory:<rule-id|none> retire:#<issue>` on the line directly
  above the declaration; `advisory:none` claims no member file can hold the old shape, so that
  issue must then name what does read the holder. (68)

- **Creating the artifact a check will demand** — create it before the action it gates, not after.

- **Changing a per-call hook** (`engine/hooks/*-judge.mjs`, the runner) — you are a guest in the
  harness: a judge returns a verdict and `hook-runner.mjs` alone exits, 0 or a deliberate 2;
  measure before and after with `node dev/tools/hook-latency.mjs` and record the numbers in the
  element's retrospective brief. (70)

## The engine, the mount and what reaches members

- **Editing `claudinite-scheduler.yml` or `claudinite-executor.yml`** — nothing beyond triggers,
  permissions, concurrency and the `run:` line naming an engine module. A converge cannot push to
  `.github/workflows/`, so logic left there costs a fleet-wide PR to change.

- **Moving a scheduler workflow's program out** — into `packs/claudinite-tasks/queue/`, leaving a
  single-line `run: node <module>`, and edit both copies — the stub and the canon's own — in the
  same commit. `scheduler-workflows-are-thin` blocks the two shapes it can see.

- **Writing a path, regex or command against the mount** — the two-root form: the
  `.claudinite/(shared|local)/` prefix optional in a pattern, and a probe for `.claudinite/shared/`
  falling back to the repo root. The home runs the same code from the repo root. (26)

- **Tightening a contract member-owned files must satisfy** — first ask what carries it across the
  fleet. Vendoring refreshes `.claudinite/shared/` only and a migration record moves paths, not
  schemas; if nothing carries it, accept the legacy shape in `normalizeManifest`.

- **Adding a key to the declared-check spec vocabulary** (`SPEC_KEYS` in `pattern-rules.mjs`) — an
  older engine drops that key and runs the rest of the declaration, so the new key buys nothing
  until its engine arrives. Write the declaration to be correct without it (#1400).

- **A stale member declaration** — fail the run. Never let it degrade to *fewer checks running*.

- **Renaming a pack whose config a member writes into their own repo** — a reader of that config
  resolves the new key and every legacy spelling, permanently. The rename map fixes code-side ids
  only; rewriting the write side reaches just the data the engine owns. (27)


- **Extending what a copied stub reads** — make the new config key optional, fail the run when it
  is declared-but-unset, and let declaring it trigger a staleness check. Stubs are copied once and
  never re-copied, so a new key is dead in every repo holding the old copy. (29)

- **Writing a migration record that needs engine behaviour newer than itself** — have `appliesTo`
  probe the member's own mount for that capability by content, and stay inert until it reads back;
  an unreadable mount reads as "not capable". The executing worker is the member's vendored
  one. (30)


- **Retiring an emptied `updates/*` export** — read the field: the condition is that no member's
  *vendored* worker calls it. Pin the surface with a test carrying an expiry; the canary rehearsal
  cannot catch this class.

- **Renaming or deleting an `engine/` module a `packs/` file imports** — leave a shim at the old
  path re-exporting what it named. The two lanes deliver on separate cycles, so every member spends
  a window holding the NEW engine beside an OLD pack. (31)

- **Asking which imported symbols are still fielded** — walk the TRUNK's pack history, never
  `--all`. An import that only ever existed on an unmerged branch is not fielded. (32)

- **Changing a vendored stub** — edit the canon's own `.github/workflows/` copy in the same commit
  and diff the two whole files. The canon has no converge, so its copy drifts invisibly until it is
  a permission denial in production.

- **Excluding files from the vendor set by pattern** — whitelist any operational file that matches
  by path, and pin it with a test against the real canon tree. The nightly refresh re-runs from
  canon HEAD, so a bug there is the one canon regression that is not self-healing. (33)

- **Testing that an operational file still vendors** — assert the whole containing directory, not
  the one file that broke; otherwise the next file added there needs a fresh edit. (34)

- **Retiring or reshaping a protocol the engine exposes** — sweep for callers outside this repo,
  not just what greps locally. Two stub copies at the same path declaring different input names is
  the same failure from the other side: the two spellings *are* the protocol. (35)

- **Branching on the result of an API write in fleet machinery** — read its status, not just the
  body. A body-only destructure turns a 403 into a plausible object and the run still logs `ok`.

- **Judging whether fleet delivery worked** — members' stamps, never run conclusions. The stamp is
  the only artifact that moves.

- **A single timeout bound covering two different waits** ("has this started" vs "is something
  already running about to finish") — split it, sized from each phase's own declared budget rather
  than a round number. (36)

- **Writing a give-up message for a hit timeout** — say it is a statement about the clock, not a
  verdict on the work. "No successful run yet" sends a reader chasing a settings diagnosis for CI
  that was simply still running. (37)

- **Writing generated content into a size-capped GitHub API field** — budget it in two tiers: an
  always-complete compact summary, plus best-effort detail rationed to a byte budget with an
  explicit omitted-count. An unbounded write 422s at the ~64KB cap. (38)

- **Writing a generated title whose content scales with a list** — collapse the list to a count
  and keep per-item detail in the body. A title is a summary surface, not a second body.

- **Preflighting a required grant or permission** — a probe run where the failure's condition
  isn't met reports a false-positive pass. Prefer attributing a real observed 403 to the
  permission that would fix it. (39)

- **Introducing a finer-grained classification of a catch-all state** — default whatever an older
  or unaware writer produces to the most conservative member of the new set, so it fails safe
  instead of landing in a lane nobody watches.

- **Adding a fleet task** — fail loudly on a Context target it cannot reach rather than proceeding
  on a partial list, and treat a member as un-adopted until the routine's repo scope names it.
  Otherwise the drift completes, filing a report that reads as a full sweep. (40)

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
  operation's most dangerous mode. (41)

- **Relying on a push to trigger further Actions workflows** — a push authored with the default
  `GITHUB_TOKEN`, which every converge and auto-merge here uses, fires no `on: push` workflow. Only
  a real user or app credential cascades. (42)

- **A workflow file referencing a renamed entry point by literal path** — hold a shim open, as for
  an `engine/` module a `packs/` file imports. `.github/workflows/` lands only through a PR a human
  merges. (43)

- **A script written for one execution context** — audit every script's environment assumptions (a
  real `GITHUB_TOKEN`, `gh`/`curl` reachability) whenever its caller's context changes. Every
  script built against the old assumption fails identically, not just the one that broke first.


- **Carrying a dotted version identifier** — keep it string-typed everywhere. `'60820.10'` and
  `'60820.1'` are different versions and the same float. (46)

- **Designing text that instructs a model to echo an exact string** — state the instruction first,
  have it disclaim itself as instruction-not-payload, and put the literal string once, last. Never
  reference the payload anaphorically ("that line"); recency is what resolves it. (47)

## Scheduled tasks

- **Filing an issue no person will ever act on** — a board, a watermark, the machine's own
  bookkeeping — file it CLOSED and labelled, state both on every write so a reopened or
  pre-rule one converges, and find it by that label rather than paging the repo's closed
  history. (69)

- **Opening a queue work-item's own delivered PR** — never `Closes #<the item's own issue>` in
  the body. `converge-item.mjs` closes or parks that issue with the right label state; the native
  keyword fires on merge regardless and overrides an intended `needs-human-approval` park. (49)

- **Choosing a task's cadence** — take it from how often the signal actually moves. A weekly run
  still sees all 7 days, because a task's signal window is its own period plus an hour of slack.

- **A precondition that fires nearly every night** (one reading `sharedMount`) — daily buys noise,
  not freshness, and spends an opus session each time. Prefer weekly where the work isn't
  latency-sensitive.

- **After any scheduler-mechanism flip** — re-audit every task whose precondition assumed the old
  mechanism; grep for `frequency: 'manual'` plus its precondition text, not just the flipped
  mechanism's callers. A stale `run: false` becomes a live self-closing landmine. (50)

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
  session. (51)

- **Closing a run `outcome:done`** — it means nothing is left for anyone to act on. Never while a
  PR, branch, or open question from this run is still live.

- **Decomposing a pipeline into chained tasks** — chain stages by preconditions that each
  re-derive the world's actual state, never by parameters passed forward. A run interrupted
  mid-pipeline then self-heals on the next pick.

- **Setting `on_interrupt: 'needs-human'`** — narrow it to the one stage whose side effect is
  genuinely non-idempotent. (52)

- **Passing a diagnostic verdict out of a subprocess that may be killed at its timeout ceiling** —
  write it to stdout/stderr, never a file written at exit. Already-printed output survives a
  `SIGKILL`. (53)

- **Writing a repair rule over a live, mutating collection** — a rule gated on *current state*
  needs a fresh, targeted read of the item immediately before acting, never the snapshot that
  triggered the sweep. A rule gated on a *clock* is safe against snapshot staleness.

- **Solving a "must act again later" problem** — check whether an existing generic lane already
  carries it before building standing machinery. The deferred-request queue's
  `Blocked-by`/`Not-before` lane does.

- **Building a dedup or mutex over work items** — key the guard on the target the write lands on,
  never the requester's phrasing. A same-title match is blind to two items writing one target under
  different titles; `Blocked-by:` is what serializes them. (54)

- **Converging a work item from a session** — `converge-item.mjs` prints the calls; making them
  verbatim with your own GitHub tools is the whole path, on every session, with or without a REST
  route. Hand-fabricating the transition is how an item ends up closed wearing a live status, or
  labelled `done` and left open. (2)

## Proving a change

- **Testing a change to a task's triggering** — drive the real `planSchedulerRun` from a clock at
  which the task's anchor has NOT come. Instantiation is decided before any precondition runs, so
  starting from a queued item proves only "works once instantiated".

- **Testing a fail-soft step** — assert the positive effect (the output IS emitted), never
  `status === 0`, which fail-soft makes meaningless. The engine is vendored verbatim, so one
  regression disables that step fleet-wide.

- **Testing a helper reapplied across a hand-off, a re-queue or a retry** — call it twice and
  assert no duplication. A suite of single-call tests stays green while the multi-call case
  corrupts state.

- **Testing a mechanism that arbitrates by identity** (a claim, a lock) — the second call must
  come from a *different actor*. One actor retrying its own stale claim can't expose an
  identity-masked race. (55)

- **Building a simulator for a stateful engine mechanism** — model what the engine's code actually
  *writes*, never the rule's stated *intent*. A sim advancing state wherever the rule's description
  matches is correct by construction and blind to where the two diverge.

- **Asserting a mid-run invariant** — capture it at the exact moment the state holds. By the end
  of the run, normal convergence has cleared the evidence.

- **Writing a regression test that pins a policy or convention decision** — assert the
  behavior/invariant the decision requires, never a literal sentence quoted from a doc: a
  sentence-matching test stays green even while a sibling doc states the opposite, certifying the
  contradiction instead of catching it.

- **A test that derives its answer by walking git history** — guard explicitly against a shallow
  clone and fail loudly. It otherwise passes vacuously exactly when the real answer needs history
  it doesn't have. (56)


- **Restoring source after a deliberate see-it-fail mutation** — `git checkout -- <file>` at the
  moment of mutating, never a `.bak` taken earlier, which predates whatever else you edited in
  between. (57)


- **Surveying whether something exists in the tree** — a code-search hit is evidence; a miss is
  not. Survey by reading each file.

- **Documenting or relying on a named knob** — grep for the code that reads it and the code that
  writes it first. The corpus naming it is not evidence it exists; all three misses are real
  here. (62)

- **Deleting a writer** — it is the same change as marking its series historical. Its rows keep
  counting plausibly until the retention window ages out, then count nothing. (63)

- **Renaming an entity** — sweep for references in code and comments, don't change historical
  records, and re-render generated files rather than editing them by hand.

- **Sweeping a rename mid-migration across many PRs** — a file added or rewritten after the sweep
  starts can independently reinvent the retired constant as a comparison key; a state comparison
  against it fails silently, with no error and no failing test, only a wrong count. (3)

- **Renaming a word that is also stored data** (a counter key, a wire word, a label) — rename it
  on the **decode** side too, or the next encode writes those historical counts as `null`,
  silently and only for the old rows.

- **A second rename of one name** — map every legacy spelling straight to today's, never chaining
  one normalization onto the last, so the oldest vocabulary still normalizes in a single pass. (64)

- **Writing a "this period is covered" marker in an idempotent pipeline** — write it strictly
  after the durable effect it guards, and scope it to the *declined* case only. A go verdict's
  coverage is judged by the item it created, never by the row.

- **Verifying a bulk file-move or rewrite sweep preserved content** — check a structural invariant
  count before and after (total `test(` calls across the touched files). One sweep truncated 46
  test files to zero bytes and every one still "passed".

## Editing, branching and merging here



- **A JSON target nested inside an array within an entry object** — parse and rewrite
  structurally, preserving key order and `via`/`config`/answers by hand. An anchored regex cannot
  cross the nested closing bracket, and a fixture without that nesting proves nothing. (65)

- **Returning to a branch that waited** — after `git fetch`, re-verify the *premise* unasked: say
  whether the problem is still there and what survives. This repo auto-merges its own PRs on top of
  migrations that retire whole directories.


- **Merging a PR that has sat open across many `main` commits** — check its current
  `mergeable_state`, not an old green CI run. A structural change on `main` since (a directory
  move, a renamed path) can turn a once-clean branch conflicted without a new run ever failing.

- **After a PR lands by squash-merge** — `git remote prune origin` before touching that branch
  again. GitHub deletes the head ref here, so a stale tracking ref makes the next push reject and
  the stop hook report phantom local work. (67)



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

- **Running the prose-to-checks sweep here** — the worklist is
  `docs/declarative-checks/rule-inventory.md`, every rule classified by the moment that could
  carry it; convert from its A–F rows, and correct a mis-read row there, dated, rather than
  re-deriving the class.
