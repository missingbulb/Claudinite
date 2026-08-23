# Claudinite — the canon's own non-portable working rules

Lessons specific to working on the canon itself. Anything true for repos beyond this one belongs in
the shared canon under `packs/`/`skills/` instead. The `growth-extract` task appends here, each
lesson at the strongest mechanism available — a check where the rule is deterministic, else prose.

## Standing owner decisions — settled, do not re-litigate

- **Wanting a rule about what the `packs/` tree may reference** — declare and configure the
  `barriers` pack, extending it generically if a capability is missing. Never write standalone
  code that checks packs-tree segregation.

- **Writing a `docs/<initiative>/DESIGN.md`** — the end state and its rationale only, with
  alternatives and their drawbacks; never requests, prior-state narrative, or owner opinions.
  The migration is work, not a document: its phased plan, status and remaining work live in the
  tracking issue (`writing-migration-plans`), never in a sibling `MIGRATION.md`.

- **A `docs/<initiative>/DESIGN.md` whose system is now built** — its content duplicates the
  module headers and pack `README.md`s that must independently state the same facts once the
  pipeline exists, so a design doc that survives the build only has to be kept in sync with both.
  Verify each section actually lives there before touching anything; move what has no other
  home (an owner-decision record with its rationale is typically the one irreplaceable part),
  sweep every `§`-numbered pointer into a pack-README reference (or drop it where the sentence
  only cited itself), and delete the doc whole rather than trim it. Don't extend the sweep to a
  design doc that still describes work in flight, or a much larger one many module headers cite
  by section — decide those separately rather than discover the scale mid-run (#1169).

- **Ending a session on unfinished work** — write the state into the tracking issue. The
  owner's opener is `continue work on #<n>`, so anything else is lost; never compose a hand-off
  prompt.

- **Designing anything that spans repos** — split it: a self-contained per-repo half in the
  canon, the aggregation half as a Shepherd fleet task. No repo list exists anywhere in canon
  code; Shepherd enumerates members at runtime. A derived fleet artifact lands there as a daily
  auto-merged PR of a `GENERATED` file, never a commit to its `main`.

- **Choosing a value right for nearly every project** — keep it in the pack's own code: ask
  nothing at adoption, write nothing into the member's config. Read config as optional — an
  unset key means the default, never "misconfigured".

- **Needing a member to flip a platform setting or hold a wider credential** — last resort:
  per-repo manual work reliably does not happen, and the capability then dies silently in every
  repo nobody configured. Prefer the route that works with the Action's own `GITHUB_TOKEN`, and
  neutralise a blocking platform behaviour's *effect* rather than asking for the platform to be
  reconfigured. Where nothing weaker can work (`FLEET_GITHUB_TOKEN`), name the exact scope and
  have the automation report when it is missing rather than degrade silently.

- **Landing a change to what members receive** — force delivery in the same session only when
  *"will it work on every repo?"* is a live question: the answer turns on how members differ —
  engine flow, a contract their own files must satisfy, a stub or workflow, a migration record, a
  new config key. Then drive Shepherd's `fleet-baseline` with `follow`, report per member unasked,
  and attach the repos that verification needs rather than offering to; a dispatch is not a result,
  and 204 means queued. Where the change is uniform by construction — prose, a doc, a move of
  something nothing executes from the mount — the nightly converge *is* the delivery, and forcing
  buys noise rather than assurance.

- **Retiring a field, option or module** — `@deprecated` on its definition, plus a comment at
  each sanctioned holdout's declaration site saying why it still carries the field. Never a
  bespoke conformance check for a deprecation. Keep the contract validating the lingering field.

- **Wanting a `.claudinite-settings.json` entry's config validated** — that is a real JSON Schema
  the file points at with `$schema`, checked by ordinary tooling. Never a coded per-pack
  validation vocabulary or a bespoke `configSchema` type system on the manifest — built and
  reverted in #919 ("That's why we have schemas").

- **Wanting to share logic between two sibling packs** — never put it in `engine/`, which breaks
  the package-manager model, and never make one pack depend on the other, which is what breaks
  pack independence. First check whether the sharing is even necessary — self-describing data
  (each side states its own field vocabulary) can remove the need to interpret another pack's
  format at all. Where identical code is still needed, consider duplicating it, possibly with a
  drift guard; sometimes duplication between packs is fine (#959: "why do you even need a drift
  guard? Just write the json. Don't overkill.").

- **Surfacing a number a human reads as a report card** (a dashboard tile, a digest, a fleet
  rollup) — never a monotonic cumulative total, which says nothing about today, and never a figure
  nothing measures (no estimated hours saved, no score). Report a **window against the previous
  window**. Where a field can't be had from the reads already being made, name it as absent in the
  surface's own note rather than approximating it: a stated gap is information, a guess is not
  (owner, #1001). Before windowing a count, check whether it is built from an event log or from a
  point-in-time **stamp**: windowing a stamp-derived figure (e.g. "members that converged last
  week", counted from each member's single last-converge date) can read a steady, healthy
  population as declining purely from where stamps land relative to the window boundary — reserve
  the window-over-window shape for counts genuinely built from things that happened inside the
  window (#1008).

- **Classifying an issue or work item by deriving it structurally from other live state** (a
  title match against what's declared at HEAD, a computed membership test) — reconsider once the
  derivation's own inputs can mutate while the classified object stays open. A "standing vs
  ad-hoc" task classification computed live from whether an issue's title matched a task declared
  at HEAD silently reinterpreted an open issue's own history the moment that task's frequency or
  name changed underneath it. An explicit marker stamped once at creation and never revisited
  doesn't have that failure mode — the general preference for a structural classifier over a
  hand-set field holds only for state that isn't itself still in flight (#1120).

- **Scheduling the removal of a temporary compatibility tolerance** (an old-format reader, a
  legacy-field fallback) — gate the removal on a converge-cycle-confirmable precondition ("no
  member still stamps the legacy format"), never a calendar date alone. Retiring the tolerance
  while a member is still on the old format doesn't just leave that member behind: the value it
  stamps starts reading as "no version installed" to the now-stricter reader, which re-applies
  every migration record in the corpus (#1106).

## Working with the owner and the session's tools

- **Answering "why did it fail?"** — lead with the throwing call site: `file:line`, the
  function, and which side enforced it. A correct narrative that never names the line reads as
  unanswered.

- **Reaching for `AskUserQuestion`** — it blocks for minutes (~170s median), so spend it only
  on a fork you cannot take back. Anything answerable from the instruction, the tree, or a
  reversible default: answer it, act, and say what you assumed. Never re-post a question that was
  declined — take its recommended default, or open the question up.

- **Being asked to generalise something, or to review it** — land the conversions or action
  points it unlocks in the same change. A capability ships with the caller that exercises it; an
  analysis ships with the first of its recommendations applied.

- **Calling anything on `Claude_Code_Remote`** — one call per intent, ever. Each costs
  minutes, and a call that returns nothing has *not* failed — the retry has run to 81% of a
  session's tool wall-clock. For "is it green yet" read the check status directly; to read a
  public sibling repo, `git clone --depth 1` (~2s), since `add_repo` attaches nothing the git
  proxy doesn't already serve.

- **Waiting for something to happen** — the guard must name the condition awaited (a run's
  status, a file's arrival, a deadline), with no trailing padded `sleep`. A guard you wouldn't
  write as the *whole* test means you are sleeping and calling it polling. **Exception: GitHub
  CI/PR check status is not this repo's case for `Monitor` or a `curl`/shell poll loop** — this
  sandbox proxy-blocks `api.github.com`, so both silently report "still running" until they time
  out (measured ~26 minutes lost across two PRs waiting past an already-green check, #880). Read
  the head sha's check runs with the GitHub MCP tool instead. Poll it on a rolling backoff, or
  not at all when a background watcher already reports that signal.

- **Writing a step a human must do by hand into an issue** — when asking for a manual action,
  make absolutely sure it is needed: a checklist whose items are mostly no-ops teaches the reader
  to skim it, exactly what the checklist exists to prevent. Make the breadcrumb trail a
  hyperlink, to the deepest existing settings URL — a link keeps working or redirects where a
  written-out trail goes stale the moment GitHub reorganizes the page (#952, owner-authored).

- **Replying to an owner comment that raises more than one claim** — answer **every** claim in
  that first reply, including the one you intend to push back on. A claim left silently
  unaddressed, even when the rest of the reply is right, just makes the owner re-raise it later
  (#864: a placement objection went unanswered for 55 minutes before the owner repeated it).

- **Repeating a design doc's stated architectural rationale** — verify each of its claimed
  grounds against the current code (declared secrets, executor permissions) before reciting it
  again, especially once a direct challenge has already found it wrong once. The same overstated
  "a task structurally cannot hold this permission" argument was corrected twice in one session —
  once for a GitHub Pages deploy, again minutes later for a chrome-extension release — because
  code-work already runs inside the executor's own Action job with the permissions in question
  (#1069).

- **An owner reversing a standing decision** — the fix is not answering the question that
  prompted it, it is finding and purging every place in the repo (docs, comments, code defaults)
  that still states the old decision, and recording the new one where a future session reads it
  before ever asserting the stale version again. One reversal (turning local scheduling on,
  moving `canon-curation`) had to be repeated five times before a session treated it as a
  durable-artifact problem rather than a one-off answer (#364).

- **Firing `AskUserQuestion` on a vague, destructive-sounding instruction** ("remove the entire
  mechanism," "get rid of the whole thing") — scope the question to pin down the boundary of the
  vague noun itself, not just the downstream consequences of one reading of it. A question that
  asked only what happens to the one dependent check, while silently assuming "entire mechanism"
  meant the whole engine surface, let 15 minutes of deletion, test-authoring and PR/issue
  bookkeeping land before the owner caught it nine minutes later and all of it was discarded with
  a hard reset (#1114).

- **Sending a screenshot rendered from a scratch test harness rather than the live page** — say so
  explicitly in the caption, not just what the widget shows: a caption naming only the content lets
  the reader assume it's the real page's current layout. A CSS-preview screenshot captioned only
  with what the card showed cost a clarifying round-trip when the owner reasonably read the
  harness's own ordering as the dashboard's (#1249).

## Authoring packs, prose and checks

- **Writing a paragraph that explains how a mechanism works** — not into a pack's `RULES.md`,
  which every session in every declaring repo pays for. Behaviour belongs in the module header and
  the pack `README.md`; the test is whether an agent could act differently for having read it.

- **Having a deferred direction, blocked proposal or status to record** — put it in `docs/`
  and point at it from the issue or PR, not from a pack file: `docs/` is outside the vendor set.

- **Naming a new canon pack** — kebab-case, named for the surface it serves rather than the
  first feature you are building for it. A pack whose subject is a **Claudinite feature itself**,
  rather than a technology or a way of working, carries the `claudinite-` prefix
  (`claudinite-lifecycle`, `claudinite-growth`, `claudinite-dashboard`) — owner, 2026-08-18.
  The directory name is the pack's public id, spelled in
  every member's declaration, so another casing costs a fleet-wide rename. `claudinite-growth`
  is grandfathered. (convertible → prose-to-checks)

- **Starting a new Claudinite-facing capability** (a tool, a dashboard, anything meant to reach
  more than the current repo) — decide **which distribution model it is** before writing the
  first file: a member-local tool, always-on engine code, or an opt-in pack with its own
  adoption/scaffolding. Nothing prompts this choice on its own, and getting it wrong costs a full
  move-and-rewrite cycle per correction — one session paid it three times in a row before landing
  on "opt-in pack" (#934).

- **Looking for a skill and not finding it in `.claude/skills/`** — read
  `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree. Mounting filters on the *literal*
  declaration and the home doesn't declare `git-github`, so an unmounted skill says nothing about
  whether its procedure applies.

- **Adding or changing a check** — update the pack's catalog row, and re-run the suite against
  current `main` before merging: a whole-tree aggregate is judged post-merge, so a branch's own green
  never covers it. Never transcribe a corpus-wide total into a doc — `packs/README.md` states how to
  count checks and rules instead of quoting a number, so every pack change no longer edits it.
  (portable → `merge-to-main`)

- **Writing a check's `fix` text** — name only remedies that match the enforced severity;
  sessions follow the words, not the `severity` field. An advisory finding's remedies are act on
  it or leave it, never a config-acceptance escape.

- **Declaring a check, or adding a key to the vocabulary** — name the key so the declaration
  reads alone to someone who hasn't read the design doc (`scanFiles`, `matchLines`,
  `relevantWhen`): if it needs a comment to be read, it needs a better name. Declarations live in
  `packs/<pack>/declared-checks.json`, which cannot hold one, and borrow nothing from prose — no
  `description`, no `doc`; the line the agent reads is `failureMessage`.

- **Writing a check that reads the session transcript** — screen the harness's own **plain-text**
  pseudo-turns, not only the tag-wrapped ones. `humanText` in
  `engine/checks/helpers/session-transcript.mjs` drops a user entry that starts with `<`, which
  lets a bracketed marker straight through: `comment-classification` blocked a session on
  `[Request interrupted by user for tool use]` as "the owner's latest comment". A conversation rule
  fires at the Stop hook, where a false positive spends a whole cycle on something no edit can
  clear — so its fixture carries an interruption marker beside a real owner turn.

- **A doc reached only by following a link out of `RULES.md` or a check's `doc:`/`More:` line** —
  if it is a how-to wanted at authoring time rather than prose every session should carry, convert
  it into a skill (frontmatter + description) invocable by description, not a doc chained through
  links nobody follows cold (#975).

- **A check declaration's `doc:` field** — nothing ever opens it; it only renders into a finding's
  `More:` line when the check actually fires. A stale pointer left by a file move can sit broken
  indefinitely with nothing to catch it — grep for and re-verify every `doc:` field by hand
  whenever you move or rename the file it points at (#975).

- **A check built to catch a thing being missing or misnamed** — don't gate the check's own
  relevance on the single signal it exists to validate. Gating solely on "does the orchestrating
  file still have the expected name" makes the exact failure the check exists to catch (a rename)
  also the thing that silences the check — the run that should say "rename it back" never fires.
  Use two independent signals, either sufficient, so at least one survives when the other is the
  thing that broke (#1060).

- **Deciding whether an enforced check still earns its keep** — measure its actual blocking-firing
  rate against what it buys, not vibes. A check whose firings are dominated by cases where the
  agent had already done the right thing, and the check only wants the exact tokens for it, is a
  demotion candidate (check → prose-only), justified by the firing-frequency data itself:
  `comment-classification` fired 204 times in 31 days, 21% of all blocking findings, each one a
  blocked Stop-hook turn spent re-emitting a line the session had already been told to emit
  (#1118).

- **A documented multi-step procedure the agent re-derives interactively every time it runs** —
  that pattern, not the doc's polish, is the signal to mechanize it into a script the agent runs
  once. A nine-part prose bootstrap doc cost ~90 exploratory tool calls and ~11 minutes per
  adoption for work that runs in seconds once scripted. Part of that cost was sequencing, not
  exploration: the tracking issue was created only after the first commit had already failed the
  issue-reference check, costing a full amend/force-push/CI cycle — create the artifact a check
  will demand *before* the action it gates, not after (#1132).

- **A canon pack's own prose naming another pack by literal path** — check the name resolves
  inside every consumer's vendored tree, not just the canon home. A canon pack vendors wholesale
  into every declaring repo, but `.claudinite/local/packs/<pack>/` exists only in the canon home
  itself, so a vendored pack's link or comment naming a home-only local pack (e.g.
  `canon-curation`) dangles everywhere else it mounts. Corrected once by the owner and swept out of
  `claudinite-growth` ("I can't understand why you insist on referring to canon-curation ... just
  don't mention the things outside the pack", #364), it recurred unnoticed:
  `generate-project-instructions/SKILL.md` still links
  `.claudinite/local/packs/canon-curation/README.md` today, and
  `growth-write-scope.mjs`/`README.md` still name `canon-curation` in prose. The `barriers` pack's
  config gates `packs/* → docs/` but nothing gates `packs/* → .claudinite/local` — that is the
  durable fix a future canon-writing session should land, not another one-off sweep.

## The engine, the mount and what reaches members

- **Editing `.github/workflows/claudinite-scheduler.yml` or `claudinite-executor.yml`** — don't, beyond
  the triggers, permissions, concurrency and the `run:` line naming an engine module. A converge
  cannot push to `.github/workflows/`, so a member's copy moves only through a human-merged PR in
  each repo, while every engine module converges nightly: logic or prose left in these two files
  costs a fleet-wide PR to change. Move the program into `engine/scheduler/queue/`, keep the YAML
  to a single-line `run: node <module>`, and edit both copies — the stub and the canon's own — in
  the same commit. `scheduler-workflows-are-thin` blocks the two shapes it can see
  (`actions/github-script`, a block `run:`); the comment budget is judgment.

- **Writing a path, regex or command against the mount** — write the two-root form: the
  `.claudinite/(shared|local)/` prefix optional in a pattern, and a probe for
  `.claudinite/shared/` falling back to the repo root. The home runs the same code from the repo
  root, so a mount-shaped path works fleet-wide and fails on exactly this repo — where it
  surfaces last.

- **Adding a module under `packs/`** — keep it import-light, and start work after evaluation
  completes (`check(…).catch(…)`), never in a top-level `await`. Discovery imports every
  `pack.mjs` and `checks.mjs` before activation is consulted, so a module that is also a CLI entry
  point is re-imported mid-evaluation and Node exits 13 having run nothing.
  `pack-discovery-entry-await` enforces the await half only.

- **Tightening a contract that member-owned files must satisfy** — first ask what carries it
  across the fleet. Vendoring refreshes `.claudinite/shared/` only and a migration record moves
  paths, not schemas — so if the answer is "nothing", accept the legacy shape in
  `normalizeManifest` until a carrier exists. Never let a stale declaration degrade to *fewer
  checks running* rather than a failure.

- **Renaming a pack whose config a member writes into their own repo** — the rename map fixes
  code-side id resolution, but it cannot rewrite a member's own already-committed config, which
  converges on its own separate schedule or never. A reader consuming that config keeps resolving
  both the new key and every legacy spelling explicitly and permanently: rewriting the write side
  to the new name (the fix for the fleet's own persisted data) only helps where the engine itself
  owns the write, not data a member wrote into their own repo (#1081).

- **Checking whether an actor may trigger a privileged automated action off a GitHub issue/PR
  payload** — read the actor's permission from the collaborators-permission API
  (`GET /repos/{o}/{r}/collaborators/{u}/permission`), never the payload's `author_association`:
  `MEMBER` covers any org member regardless of repo permission, and `COLLABORATOR` includes
  read-only collaborators — both broader than push access (#1067).

- **Extending what a copied stub reads** — make the new config key optional, fail the run when
  it is declared-but-unset, and let declaring it trigger a staleness check (`build_vars` /
  `release-workflows` is the shape). Stubs are copied into a member's `.github/` once and never
  re-copied, so a new key is silently dead in every repo holding the old copy.

- **Writing a migration record that needs engine behaviour newer than itself** — have
  `appliesTo` probe the member's own mount for that capability, by content rather than version,
  and stay inert until it reads back; an unreadable mount must read as "not capable". The record
  comes from a fresh canon clone but the worker executing it is the member's vendored one, so
  otherwise the converge fails, the mount never advances, and the fix can never arrive.

- **Changing an export in `updates/*`** — empty it, never remove it. Fielded workers are stale
  callers of instantly-current flow modules, so a removal wedges every member permanently on its
  next run. Keep it callable, say at its definition that this is why, and pin the surface with a
  test carrying an expiry — the canary rehearsal cannot catch this class, since it drives the
  worker this ref ships. Retire it by reading the field: the condition is that no member's
  *vendored* worker calls it.

- **Renaming or deleting an `engine/` module a `packs/` file imports** — leave a shim at the old
  path re-exporting what it named, for the same reason and by the same rule as `updates/*` above:
  the engine lane and the pack lane deliver in separate PRs on separate cycles, and pack delivery is
  version-gated per pack, so every member spends a window holding the NEW engine beside an OLD pack.
  The failure is worse than a broken task — a pack that fails to load fails the mount's self-test,
  the converge then refuses to land AT ALL, and the member cannot receive the pack version that
  would have fixed it (#1004: a green run, an unmoved stamp, and a `needs-human` PR). Ask which
  symbols are fielded by walking the TRUNK's pack history, never `--all` — an import that only ever
  existed on an unmerged branch is not fielded, and scanning every ref fires on whatever is in
  flight.

- **Changing a vendored stub** — edit the canon's own `.github/workflows/` copy in the same
  commit and diff the two whole files. The canon has no converge, so its copy drifts invisibly
  until it is a permission denial in production.

- **Excluding files from the vendor set by pattern** — whitelist any operational file that
  matches by path, and pin it with a test against the real canon tree, not only a fixture. The
  nightly refresh re-runs the computation from canon HEAD, so a bug there is the one canon
  regression that is not self-healing. Assert that the **whole containing directory** vendors,
  not just the one file that broke — a test re-asserting only the known-missing file needs a
  fresh edit for the next file added there; one that walks the real directory doesn't (#907).

- **Retiring or reshaping a protocol the engine exposes** (a dispatch input, a stub's declared
  interface) — sweep for callers **outside this repo**, not just what greps locally. `FORCE_TASKS`'s
  replacement broke Shepherd's only caller because the migration enumerated this repo's own
  callers and missed the cross-repo one (#929); two independently-maintained stub copies at the
  same path declaring different input names is the same failure from the other side (#801, #907)
  — the two spellings *are* the protocol, and they live in different trees.

- **Branching on the result of an API write in fleet machinery** — read its status, not just
  the body: a body-only destructure turns a 403 into a plausible object and the run still logs
  `ok`. Judge the fleet by members' stamps, never by run conclusions — the stamp is the only
  artifact that moves when delivery actually worked.

- **A single timeout bound covering two different waits** ("has this even started" vs. "is
  something already running about to finish") reintroduces the bug a prior fix closed, on
  whichever side crosses the shorter phase's real need. Split the bound to match what each phase
  is actually waiting on, sized from that work's own declared budget rather than a round number —
  and once a bound is hit, the give-up message must never read as a verdict on the work: "no
  successful run yet" is a statement about the clock, not about the runs, and collapsing the two
  sent a reader chasing a wrong repository-settings diagnosis for CI that was simply still running
  (#1027).

- **Writing generated content into a size-capped GitHub API field** (an issue or PR body) —
  budget it explicitly, in two tiers: an always-complete compact summary plus best-effort detail
  rationed to a byte budget with an explicit omitted-count, never a single unbounded write that
  can 422 outright at the ~64KB cap. `growth-dedup`'s brief rendered 350KB against that limit and
  would have failed the run at its first step.

- **Writing a generated title whose naive content scales with a variable-length list** (a PR
  title, a notification headline) — collapse the list to a count and keep the per-item detail in
  the body. A title is a summary surface, not a second body, and grows unreadable exactly where a
  long list makes every character compete for space (#1048).

- **Preflighting a required grant or permission** — a probe is only as good as the environment it
  runs against; where the failure is conditional (a scope that 403s only under a specific
  condition, e.g. a private repo), a probe run where that condition isn't met reports a
  false-positive pass. Prefer attributing a real observed 403 to the permission that would fix it
  over guessing from an unrepresentative probe (#1052).

- **Introducing a finer-grained classification of an existing catch-all state** — default
  whatever an older or unaware writer produces (or a future writer's not-yet-known category) to
  the most conservative member of the new set, not the most lenient. An unlabelled park now reads
  as the blocking `failure` lane rather than a soft one, so a writer that predates the split fails
  safe instead of silently landing in a lane nobody watches (#1051).

- **Adding a fleet task** — fail loudly on a Context target it cannot reach rather than
  proceeding on a partial list, and treat a member as un-adopted until the routine's repo scope
  names it. The target list is enumerated over `FLEET_GITHUB_TOKEN` while the grant is hand-typed
  UI config no Action can read; the drift *completes*, filing a report that reads as a full sweep.

- **Spawning a child process from a worker** — pass an explicit `cwd`, resolved to a root that
  cannot vanish (`--root`, then `CLAUDE_PROJECT_DIR`, then `cwd`). The converge deletes the tree
  its own code-work runs inside, so children die at `process.cwd()` before doing anything. Keep
  "could not run" distinguishable from "had nothing to run": a crash sharing a benign outcome code
  is unobservable.

- **Diagnosing a member's maintenance PR that won't land** — `unstable` beside a green sweep
  is a parked `action_required` run, not a missing repo setting. Read the member's raw
  `.claudinite-settings.json` and the head sha's `pull_request` runs; propose a platform-settings
  change only as a conclusion, never as a diagnosis.

- **Judging whether a member is fresh** — read its `ref` (or `engineVersion` /
  `packVersions`), never `claudinite.updated` alone: a held stamp pins `updated` behind a pending
  note, so a mount converging hourly can look a week stale.

- **Reading a uniform signal across every fleet member right after a shared mechanism changes**
  — a rate-limited, unauthenticated `api.github.com` probe can return a clean-looking uniform
  negative across every target, and a uniform stamp/ref shared by the whole fleet can mean "not
  yet past its nightly anchor" rather than "frozen." Check for a rate-limit signal explicitly
  before trusting a uniform empty sweep, and check timing — has each member's own convergence
  window actually passed — before generalizing one member's confirmed fault to the fleet. Never
  reuse a signal already known unreliable to corroborate a different theory (#801, #939: a "the
  entire fleet is frozen" claim stood uncorrected for ~10 hours).

- **Retiring or migrating a dispatch/config parameter channel** — a parameter that stops being
  read must fail loudly, never silently default. A dropped safety knob (e.g. `DRY_RUN`) defaults
  to the operation's *most dangerous* mode — live, unscoped — not a safe one; audit that a
  parameter's producer and consumer still agree after every interface migration (#974,
  owner-authored).

- **Relying on a push to trigger further Actions workflows** — a push authored with the default
  `GITHUB_TOKEN` (which every converge and auto-merge in this repo's own machinery uses) fires no
  `on: push` workflow; only a push carrying a real user or app credential cascades. A dashboard
  stuck showing a stale "hasn't converged" banner traced back to exactly this: the deploy
  workflow's trigger never fired for the pushes that actually moved a mount (#1094). The same
  platform fact is why `.github/workflows/` is the one path a converge cannot push into — it lands
  only through a PR a human merges — so a renamed or removed entry point that a workflow file
  references by literal path needs a shim held open until every consumer's own copy has moved, by
  the same rule as an `engine/` module a `packs/` file imports (#1108).

- **A script written for one execution context silently breaking in another** — audit every
  script's environment assumptions (a real `GITHUB_TOKEN`, `gh`/`curl` reachability) whenever the
  execution context of its caller changes, not just at the one call site that surfaced the break.
  A script written when the queue ran as an Actions job (a real token, shell GitHub access) 401'd
  once the same work started running inside an agent session (MCP-only, a proxy-scoped token, no
  `gh`) — and per the owner, every other script built against the old assumption fails identically
  in the new context, not just the one that broke first (#1133).

- **Finding a check that watches only one of two structurally-identical surfaces** — widen it to
  the sibling in the same change rather than filing it separately. A check exercising the
  scheduler's own vendored stub had never been extended to the executor's stub, which is just as
  much a fleet-wide vendored surface and just as capable of drifting unnoticed (#1138).

- **Picking a compact date-encoded identifier** (a version stamp, a compact timestamp) — check
  the encoding's own rollover boundary years ahead, not just today's decode correctness: anchoring
  a year on its last digit wraps to 0 in 2030 and sorts a decade of releases underneath every 2029
  one, so the anchor point matters (`year - 2020`, not `year % 10`). And keep the identifier
  string-typed everywhere it travels — `'60820.10'` and `'60820.1'` are different versions and the
  same float, so nothing in the corpus may parse one as a number (#1105).

- **Designing text that instructs a model to echo an exact string** (a session-start directive, a
  generated title) — don't reference the payload anaphorically from later text ("that line," "the
  above"); state the instruction first, have it disclaim itself as instruction-not-payload, and
  put the literal string once, last, introduced by the instruction's own colon. Recency is what an
  LLM actually resolves ambiguous reference against: putting the directive *after* the payload
  line made "that line" read as the directive sentence itself, and a session opened two replies in
  a row reciting the instruction verbatim instead of the summary (#1126).

- **A work-scope check that verifies "this PR bumped X" by diffing against `main`** — on a PR
  stacked on another still-open one, that diff already carries the lower PR's own bump, so the
  check reads it as *this* PR's and passes green even though this PR's own edits still need one.
  The false green survives only until the lower PR merges and this one rebases onto the real
  base. Re-verify (and re-bump if needed) after every earlier PR in the stack actually lands —
  never trust a stacked PR's check result against its pre-merge base (`pack-version-bumped`,
  #1119).

## Scheduled tasks

- **Choosing a task's cadence** — take it from how often the signal actually moves. A
  precondition reading `sharedMount` fires nearly every night and spends an opus session on it;
  where the work isn't latency-sensitive, daily buys noise, not freshness, and a weekly run still
  sees all 7 days because a task's signal window is its OWN period plus an hour of slack.

- **After any scheduler-mechanism flip** (how forced/manual work is dispatched, how a
  precondition is evaluated) — re-audit every task whose precondition assumed the old mechanism.
  A stale `run: false` that was previously "consulted by nothing" becomes a live self-closing
  landmine under the new mechanism — the third instance of this exact class in this repo (#929,
  #921, #971); grep for `frequency: 'manual'` plus its precondition text, not just the flipped
  mechanism's own callers.

- **Writing a task's precondition** — gate on the objects' own movement in the window (a
  `touched` list, a tip-commit date the collector actually carries), never on standing state,
  which is true forever once true. A signal true most days — a substantive `main` move — may
  only *widen* an already-triggered run. The gate is not the scope: where a verdict is relative to
  the rest of the set, newness gates and the full set stays the scope. (portable →
  `claudinite-growth/skills/writing-tasks/SKILL.md`)

- **Writing a task whose output is a regenerated file** — land it through
  `engine/scheduler/deliver-generated.mjs` and read its prior state from the fetched base, not
  local HEAD. One executor run drains several items from one checkout, so a worker that checks out
  a branch or leaves an index behind hands the next item a tree it did not expect.
  (`basics/baselining` is the deliberate exception.)

- **Wanting to exercise a task Action-side** — dispatch the scheduler workflow with its `wake`
  input naming the task, which clears the standing item's wait and puts it back in the queue; the
  post-scheduler run drain then picks it up in the same run. The precondition is still evaluated at pickup,
  so a wake that finds no work SAYS so on the item — a forced run that does nothing is a verdict,
  not a failure. (Under the retired slot scheduler this did not work at all: dueness was stateless,
  so an off-window `workflow_dispatch` printed `- no tasks due` and looked exactly like a healthy
  run.)

- **Converging an unattended run** — do the final label/comment/close sequence as the run's very
  next action once the outcome is known, not deferred to a checklist recalled from memory at the
  end of a long session, when context is fullest and the remaining work looks like formality.
  Two runs closed `outcome:done` while their own PR sat open needing a human, and one skipped the
  outcome label and the exec record entirely (#939, #892) — five days of green-looking runs on
  one of them. `outcome:done` means nothing is left for anyone to act on; never close it while a
  PR, branch, or open question from this run is still live.

- **Decomposing a pipeline into chained tasks** — chain stages by preconditions that each
  re-derive the world's actual state, never by parameters or Context passed forward. A run
  interrupted mid-pipeline then self-heals on the next pick instead of needing `on_interrupt`
  handling at every stage, and `on_interrupt: 'needs-human'` narrows to the one stage whose side
  effect is genuinely non-idempotent (#1073).

- **Passing a diagnostic verdict out of a subprocess that may be killed at its own timeout
  ceiling** — write it to the live output stream (stdout/stderr), never to a file meant to be
  written at exit: already-printed output survives a `SIGKILL`, a file written on the way out is
  never written at all if the kill lands first (#1051).

- **Writing a stateless reconciliation or repair rule over a live, mutating collection** (a
  janitor sweep, a stale-item rule) — distinguish rules gated on a *clock* (elapsed time, safe
  against snapshot staleness) from rules gated on *current state* (need a fresh, targeted read of
  the specific item immediately before acting, never the snapshot that triggered the sweep). An
  item that settled between the sweep's read and its write is otherwise indistinguishable from a
  genuinely torn state machine: a claim-to-close window that had shrunk to ~4 seconds let a janitor
  rule stamp `task:done` and `needs-human` on an issue that had already succeeded (#1101, fixed in
  #1108).

- **Solving a "must act again later" or "must verify eventually" problem** — check whether an
  existing generic lane already gives you everything before building new standing machinery for
  it. A first cut added a whole new daily task, keyed on a title-prefix scan, to handle deferred
  production-verification; the owner pointed at the deferred-request queue's existing
  `Blocked-by`/`Not-before` lane, which already carried it end to end, and the bespoke task — a
  second queue standing beside the first — came back out (#1092).

- **Building a dedup or mutex over work items** — a same-title match only catches two items that
  are literally the same request twice; it is blind to two items that conflict by writing the
  same *target* (one file, one member's config) under two different titles. Two work lists on one
  member (`task:origin:ad-hoc`'s own REQUESTED/SUSPECTED split) hit exactly this: nothing
  serialized them until the enforcer named the member's other open list in `Blocked-by:`, letting
  the queue's own dependency field do the serializing the title mutex couldn't (#1119). Key a
  conflict guard on the target the write lands on, never on the requester's phrasing.

## Proving a change

- **Testing a change to a task's triggering** — drive the real `planSchedulerRun` from a clock at which
  the task's anchor has NOT come. Instantiation is decided before any precondition runs, so a test
  that starts from an item already in the queue proves only "works once instantiated" and says
  nothing about whether the occurrence is ever created.

- **Testing a fail-soft step** — assert the positive effect (the output IS emitted), never
  `status === 0`, which fail-soft makes meaningless. The engine is vendored verbatim, so one such
  regression silently disables that step across the whole fleet.

- **Writing a check that selects inputs by path pattern** — assert over the real tree that its
  scope is non-empty; a pattern left behind by a layout change matches nothing, reads as live and
  catches nothing, and fixtures spelling the same dead layout keep proving the matching. Likewise
  grep the tree for any directory you name in a finding, a remedy or a doc pointer before shipping
  it.

- **Testing a helper reapplied across a hand-off, a re-queue or a retry** — call it twice and
  assert no duplication. A suite of single-call tests stays green while the multi-call case
  corrupts state. When the mechanism arbitrates by identity (a claim, a lock), the second call
  must come from a **different actor** — a single actor retrying its own stale claim can't expose
  an identity-masked race, which is exactly what hid F18 until two distinct executors raced (#925).

- **Building or extending a simulator for a stateful engine mechanism** — model what the real
  engine's code actually *writes* (the artifact), never the rule's stated *intent*. A sim that
  advances state on every transition matching the rule's description, rather than only where the
  real engine leaves a mark, is correct by construction and blind to exactly the silent paths
  where the two diverge — which is where the bug lived (an episode-boundary livelock, #925).

- **Asserting a mid-run invariant in a simulator or test** — capture it at the exact moment the
  state holds, not after the run continues past it. A check re-queued before an item had ever left
  a state asserted over an item that never actually failed; by the end of the run normal
  convergence had already cleared the evidence the assertion meant to catch (#1054).

- **A test that derives its answer by walking git history** (which imports are still fielded, from
  trunk) — guard explicitly against a shallow clone and fail loudly rather than silently evaluate
  over whatever partial history happens to be present. A shallow checkout would otherwise let the
  test pass vacuously exactly when the real answer needs history it doesn't have (#1013).

- **Restoring source after a deliberate see-it-fail mutation** — `git checkout -- <file>` (or
  `git stash`) at the moment of mutating, never a `.bak` copy taken earlier: a `.bak` predates
  whatever else you edited in between, and restoring from it silently destroys that work (#922).
  `git checkout --` restores from the index, so it destroys *uncommitted* work in the same file
  just as thoroughly. Commit or stage the real edit **before** mutating anything to see it fail,
  and only mutate a file whose current state you are ready to throw away (#1010).

- **Running the test suite** — `node --test $(git ls-files '*.test.mjs')`. There is no test
  script, and every hand-written glob under-runs it silently: `node --test <dir>` doesn't recurse,
  and bash `**` without `globstar` reached 37 of 65 files. `ci.yml`'s array is not authoritative
  either. Redirect one run to a file and grep that file for whatever slice you need next — never
  re-run the ~55s suite to re-slice the same unchanged output (five reruns cost 4.5 minutes for
  five different greps, #930, #931).

- **Iterating on a sweep across many files** — while iterating, run only the test files the edit
  touches plus `check_the_work`; spend the whole suite and `check_the_world` once, at the end,
  before the commit. Both are whole-tree aggregates whose verdict cannot turn on one file of a
  sweep, and re-running them per edit is what the session actually costs: of one night's tool
  wall-clock, the session that landed #993 spent 18 full-suite runs (18 min) and 22 world sweeps
  (7 min) out of 26 min, #941's spent 22 (22 min) and 27 (12 min) out of 33 min, and #992's 7 and
  8 out of 14 min.

- **Surveying whether something exists in the tree** — a code-search hit is evidence; a
  code-search miss is not. Survey by reading each file.

- **Documenting or relying on a named knob** (a declaration field, an env var, a config key, a
  counter series) — the corpus naming it is not evidence it exists: grep for the code that
  **reads** it and the code that **writes** it first. One window turned up all three misses.
  Designed and never built, documented as live: `CLAUDINITE_TASKS_SUSPEND_ALL`, beside `exclusive`
  which had retired with its mechanism (#975). A writer with no reader left: `session_scope`, with
  nothing saying so (#993). And a reader with no writer left: the usage fold's `tasks` census,
  whose parser outlived the log lines it read, so the rows keep counting plausibly until the
  Actions retention window ages out and then count nothing (#994). That last shape is the one to
  design against — deleting a writer is the same change as marking its series historical, never
  something to notice later when the numbers reach zero.

- **Writing check-the-work** — make sure you validate it fails: create the conditions that fail
  the check and see it go red (#966, #970).

- **Renaming an entity** — sweep for references in code and comments, don't change historical
  records, and re-render generated files rather than editing them by hand (#957).

- **Renaming a word that is also stored data** (a counter key, a wire word, a label) — the sweep
  is not finished at the code. A persisted aggregate holds rows keyed by the old spelling, so the
  **decode** side must rename them too, or the next encode writes those historical counts as
  `null` — silently, and only for the old rows. And on a *second* rename of one name, map every
  legacy spelling **straight to today's** rather than chaining one normalization onto the last, so
  a declaration written for the oldest vocabulary still normalizes in a single pass (#1013).

- **Writing a "this period is covered" marker in an at-least-once or idempotent pipeline** (a
  watermark row, a dedup stamp) — write it strictly after the durable effect it is guarding, and
  never let it stand in as proof the effect happened. Modeling a decision row as sufficient cover
  for its period ate a real occurrence whenever the item the row promised had failed to actually
  get created: a write failure was silently read as "already handled," the exact inversion of the
  system's own fail-open policy. Caught by the simulator before any engine code shipped; the fix
  scopes the marker to the *declined* case only — a go verdict's coverage is judged by the item it
  actually created, never by the row (#1123).

- **Verifying a bulk file-move/rewrite sweep preserved content** — check a structural invariant
  count before and after (e.g. total `test(` call count across the touched files), never trust a
  green suite alone. A restructuring sweep's own script bug silently truncated 46 test files to
  zero bytes; each one still "passed" trivially with zero assertions, so the suite read all-green
  while the content was gone. Only a before/after count caught it (#1246).

## Editing, branching and merging here

- **Making a throwaway probe commit on a scratch branch to see a check fail** — `git commit -am`
  stages *every* modified file, not just the probe's own change; a subsequent `git branch -D` of
  that scratch branch discards any real in-progress edit it swept up along with the probe. Stash
  or otherwise isolate real pending edits first (#939).

- **Editing a repo's JSON config** — patch it as anchored text; never re-serialize. A
  round-trip rewrites what it wasn't asked to (`ensure_ascii` escapes, indent, key order, trailing
  newline) while nothing fails and tests stay green. (portable → `repo-text-sweeps`) **Exception:**
  when the target can sit inside a nested array within an entry object (e.g. a pack's own
  `via`/`config` array nested inside its `{"id": …}` entry), an anchored regex cannot cross the
  nested closing bracket, so every element after it goes silently unreached — and a fixture built
  without that nesting proves nothing, since it spells the same gap the pattern has. Parse and
  rewrite structurally there instead, preserving key order/config/`via`/answers by hand (#1042).

- **Returning to a branch that waited** — after `git fetch`, re-verify the *premise*, unasked:
  read what the new commits did to the surface you are changing and say whether the problem is
  still there and what survives. This repo auto-merges its own PRs on top of migrations that
  retire whole directories, so a branch can rebase cleanly, stay green, and no longer be the
  change to make.

- **Re-verifying a branch against a `main` that has moved** — `git rebase origin/main`, never
  `git merge origin/main`. A merge commit trips the blocking squash-merge-history check and costs
  a full rebase, a discarded CI run, and a fresh wait — paid twice in one evening on #880.

- **After a PR lands by squash-merge** — `git remote prune origin` before touching that branch
  again. GitHub deletes the head ref on squash-merge here, so a stale local tracking ref makes git
  count the pre-squash commits as unpushed: the next push is rejected and the stop hook reports
  phantom local work (#922).

- **Re-applying your edit onto a moved `main`** — re-read the fetched file, apply the same
  anchored edit, and confirm the stat shows insertions only. A pack's `RULES.md` is append-only
  and written several times a day, so restoring a whole-file copy deletes those lessons and
  nothing goes red.

- **Syncing local `main`** — `git fetch origin main && git reset --hard origin/main`,
  unconditionally. The clones are shallow, so `git pull` finds no common ancestor and reports the
  stale local ref as carrying unique commits; nothing of value is ever on this repo's local
  `main`. (portable → `git-github`)

- **Merging in a session that also has a consumer repo in its sources** — resolve the merge
  skill by *target repo*, not by which skill matched first. The consumer's skill wins on name and
  is followed to the letter, silently skipping the canon-only steps — repeatedly the post-merge
  conversation capture (`node packs/claudinite-growth/capture-log.mjs --issue <n>`), which is
  part of the merge, not an optional epilogue.

- **Having work that completes or corrects an open PR** — put it on that PR's branch. A
  dispatch prompt's designated branch routes work, not review; splitting gives the owner two gates
  for one decision and invites approving half.

- **Wanting to combine two PRs** — update the one you're keeping and close the other. Never
  push one's branch onto the other's base: GitHub marks a PR merged as soon as its head is
  reachable from its base, and a later `state: closed` is a no-op. Check the API's `merged` field
  before reporting.

- **Being asked "should no X decide this?"** — it questions whether the decision exists at
  all; never answer it by relocating the knob one rung out. Ask who would ever set it differently
  and why that can't be read off the structure — a single structural answer means delete the
  field and document the exception where it lives.

- **Facing a retry across a call whose outcome you cannot observe** — check whether declining
  to retry removes the uncertainty before building dedup or arbitration machinery to manage it. A
  timeout is exactly the case where you cannot know the first call did nothing.

- **Writing a regex-based import-path rewriter for a bulk file-move sweep** — anchor the match to
  real import/export syntax (line-start, or after a specific separator), never a bare
  `from '...'`/`import '...'` pattern searched across a file's whole text. A test fixture that
  embeds literal import syntax as string data — verifying a loader's own parsing — matches the
  same pattern a real import does, so a naive full-text rewrite corrupts it identically. Caught
  only by reviewing the diff, not by any test failure (#1246).
