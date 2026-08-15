# Claudinite — the canon's own non-portable working rules

Lessons specific to working on the canon itself. Anything true for repos beyond this one belongs in
the shared canon under `packs/`/`skills/` instead. The `growth-extract` task appends here, each
lesson at the strongest mechanism available — a check where the rule is deterministic, else prose.

## Standing owner decisions — settled, do not re-litigate

- **Wondering where `canon-curation` belongs** — `.claudinite/local/packs/`, not `packs/`: the
  canon home's curation duties are Claudinite maintaining itself. Don't propose moving it back,
  and don't call the placement provisional.

- **Describing local-pack `run_daily` scheduling** — it is ON, the fleet's default path. Never
  reintroduce an "experimental / not enabled" framing or an opt-in seam for it.

- **Wanting a rule about what the `packs/` tree may reference** — declare and configure the
  `barriers` pack, extending it generically if a capability is missing. Never write standalone
  code that checks packs-tree segregation.

- **Writing a `docs/<initiative>/DESIGN.md`** — the mechanism only. Status, phase tracking and
  remaining work live in the tracking issue; a phased plan in the sibling `MIGRATION.md`.

- **Ending a session on unfinished work** — write the state into the tracking issue. The
  owner's opener is `continue work on #<n>`, so anything else is lost; never compose a hand-off
  prompt.

- **Designing anything that spans repos** — split it: a self-contained per-repo half in the
  canon, the aggregation half as a Sheepdog fleet task. No repo list exists anywhere in canon
  code; Sheepdog enumerates members at runtime. A derived fleet artifact lands there as a daily
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

- **Landing a change to what members receive** — force a member to receive it in the same
  session: drive Sheepdog's `fleet-baseline` with `follow`, report per member unasked, and attach
  the repos that verification needs rather than offering to. A dispatch is not a result; 204 means
  queued.

- **Retiring a field, option or module** — `@deprecated` on its definition, plus a comment at
  each sanctioned holdout's declaration site saying why it still carries the field. Never a
  bespoke conformance check for a deprecation. Keep the contract validating the lingering field.

## Working with the owner and the session's tools

- **Answering "why did it fail?"** — lead with the throwing call site: `file:line`, the
  function, and which side enforced it. A correct narrative that never names the line reads as
  unanswered.

- **Reaching for `AskUserQuestion`** — it blocks for minutes (~170s median), so spend it only
  on a fork you cannot take back. Anything answerable from the instruction, the tree, or a
  reversible default: answer it, act, and say what you assumed.

- **Resuming after a declined or interrupted `AskUserQuestion`** — don't re-post it. Take the
  tool's own recommended default and state the assumption, or open the question up; a decline
  means the closed choice set was wrong.

- **Being asked to generalise something, or to review it** — land the conversions or action
  points it unlocks in the same change. A capability ships with the caller that exercises it; an
  analysis ships with the first of its recommendations applied.

- **Calling anything on `Claude_Code_Remote`** — one call per intent, ever. Each costs
  minutes, and a call that returns nothing has *not* failed — the retry has run to 81% of a
  session's tool wall-clock. For "is it green yet" read the check status directly; to read a
  public sibling repo, `git clone --depth 1` (~2s), since `add_repo` attaches nothing the git
  proxy doesn't already serve.

- **Waiting for something to happen** — the guard must name the condition awaited (a run's
  status, a file's arrival, a deadline), with no trailing padded `sleep` — or use `Monitor`. A
  guard you wouldn't write as the *whole* test means you are sleeping and calling it polling.

## Authoring packs, prose and checks

- **Writing a paragraph that explains how a mechanism works** — not into a pack's `RULES.md`,
  which every session in every declaring repo pays for. Behaviour belongs in the module header and
  the pack `README.md`; the test is whether an agent could act differently for having read it.

- **Having a deferred direction, blocked proposal or status to record** — put it in `docs/`
  and point at it from the issue or PR. No file under `packs/` may link to `docs/`: it is outside
  the vendor set, so the link is dead in every consumer.

- **Homing a lesson when no visible pack seems to own it** — read
  `packs/directory.GENERATED.md`, the catalog of every canon pack, never the mounted subset: a
  session sees only its repo's declared packs, so the owning pack can be invisible and the lesson
  gets duplicated into a new local pack. Where that pack's territory is merely too narrow, widen
  its `belongs`. (portable → `grow_with_claudinite/extracting-lessons.md`)

- **Naming a new canon pack** — kebab-case, named for the surface it serves rather than the
  first feature you are building for it. The directory name is the pack's public id, spelled in
  every member's declaration, so another casing costs a fleet-wide rename. `grow_with_claudinite`
  is grandfathered. (convertible → prose-to-checks)

- **Looking for a skill and not finding it in `.claude/skills/`** — read
  `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree. Mounting filters on the *literal*
  declaration and the home doesn't declare `git-github`, so an unmounted skill says nothing about
  whether its procedure applies.

- **Adding or changing a check** — recompute `packs/README.md`'s tally (`discoverPacks` +
  `run-active-pack-rules.mjs`) rather than taking a side of a conflict, update the pack's catalog
  row too, and re-run the suite against current `main` before merging: a whole-tree aggregate is
  judged post-merge, so a branch's own green never covers it. (portable → `merge-to-main`)

- **Writing a check's `fix` text** — name only remedies that match the enforced severity;
  sessions follow the words, not the `severity` field. An advisory finding's remedies are act on
  it or leave it, never a config-acceptance escape.

- **Declaring a check, or adding a key to the vocabulary** — name the key so the declaration
  reads alone to someone who hasn't read the design doc (`scanFiles`, `matchLines`,
  `relevantWhen`): if it needs a comment to be read, it needs a better name. Declarations live in
  `packs/<pack>/declared-checks.json`, which cannot hold one, and borrow nothing from prose — no
  `description`, no `doc`; the line the agent reads is `failureMessage`.

## The engine, the mount and what reaches members

- **Expecting the home to receive what the fleet receives** — it doesn't: backfill is gated
  `!isHome`, so this repo's own `.claudinite-checks.json` only ever changes by hand.

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

- **Changing a vendored stub** — edit the canon's own `.github/workflows/` copy in the same
  commit and diff the two whole files. The canon has no converge, so its copy drifts invisibly
  until it is a permission denial in production.

- **Excluding files from the vendor set by pattern** — whitelist any operational file that
  matches by path, and pin it with a test against the real canon tree, not only a fixture. The
  nightly refresh re-runs the computation from canon HEAD, so a bug there is the one canon
  regression that is not self-healing.

- **Branching on the result of an API write in fleet machinery** — read its status, not just
  the body: a body-only destructure turns a 403 into a plausible object and the run still logs
  `ok`. Judge the fleet by members' stamps, never by run conclusions — the stamp is the only
  artifact that moves when delivery actually worked.

- **Adding a fleet task** — fail loudly on a Context target it cannot reach rather than
  proceeding on a partial list, and treat a member as un-adopted until the routine's repo scope
  names it. The target list is enumerated over `FLEET_GITHUB_TOKEN` while the grant is hand-typed
  UI config no Action can read; the drift *completes*, filing a report that reads as a full sweep.

- **Spawning a child process from a worker** — pass an explicit `cwd`, resolved to a root that
  cannot vanish (`--root`, then `CLAUDE_PROJECT_DIR`, then `cwd`). The converge deletes the tree
  its own prework runs inside, so children die at `process.cwd()` before doing anything. Keep
  "could not run" distinguishable from "had nothing to run": a crash sharing a benign outcome code
  is unobservable.

- **Diagnosing a member's maintenance PR that won't land** — `unstable` beside a green sweep
  is a parked `action_required` run, not a missing repo setting. Read the member's raw
  `.claudinite-checks.json` and the head sha's `pull_request` runs; propose a platform-settings
  change only as a conclusion, never as a diagnosis.

- **Judging whether a member is fresh** — read its `ref` (or `engineVersion` /
  `packVersions`), never `claudinite.updated` alone: a held stamp pins `updated` behind a pending
  note, so a mount converging hourly can look a week stale.

## Scheduled tasks

- **Choosing a task's cadence** — take it from how often the signal actually moves. A
  precondition reading `sharedMount` fires nearly every night and spends an opus dispatch on it;
  where the work isn't latency-sensitive, daily buys noise, not freshness, and a weekly run still
  sees all 7 days because `windowStart` widens to the widest due task's period.

- **Writing a task's precondition** — gate on the objects' own movement in the window (a
  `touched` list, a tip-commit date the collector actually carries), never on standing state,
  which is true forever once true. A signal true most days — a substantive `main` move — may
  only *widen* an already-triggered run. The gate is not the scope: where a verdict is relative to
  the rest of the set, newness gates and the full set stays the scope. (portable →
  `core/scheduled-tasks.md`)

- **Writing a task whose output is a regenerated file** — land it through
  `engine/scheduler/deliver-generated.mjs` and read its prior state from the fetched base, not
  local HEAD. Every due task in a run shares one checkout, so a worker that checks out a branch or
  leaves an index behind hands the next task a tree it did not expect. (`basics/baselining` is the
  deliberate exception.)

- **Wanting to exercise a task Action-side** — invoke its worker directly, or move the slot
  hour and wait for the cron. Dueness is stateless, so a `workflow_dispatch` outside the slot's
  window succeeds, prints `- no tasks due`, and does nothing — looking exactly like a healthy
  run.

## Proving a change

- **Testing a change to a task's triggering** — drive the real `planRun` from a deliberately
  non-due slot. The due list is computed before any precondition runs, so a test starting inside
  that gate proves only "works once evaluated".

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
  corrupts state.

- **Running the test suite** — `node --test $(git ls-files '*.test.mjs')`. There is no test
  script, and every hand-written glob under-runs it silently: `node --test <dir>` doesn't recurse,
  and bash `**` without `globstar` reached 37 of 65 files. `ci.yml`'s array is not authoritative
  either.

- **Surveying whether something exists in the tree** — a code-search hit is evidence; a
  code-search miss is not. Survey by reading each file.

## Editing, branching and merging here

- **Editing a repo's JSON config** — patch it as anchored text; never re-serialize. A
  round-trip rewrites what it wasn't asked to (`ensure_ascii` escapes, indent, key order, trailing
  newline) while nothing fails and tests stay green. (portable → `repo-text-sweeps`)

- **Returning to a branch that waited** — after `git fetch`, re-verify the *premise*, unasked:
  read what the new commits did to the surface you are changing and say whether the problem is
  still there and what survives. This repo auto-merges its own PRs on top of migrations that
  retire whole directories, so a branch can rebase cleanly, stay green, and no longer be the
  change to make.

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
  conversation capture (`node packs/grow_with_claudinite/capture-log.mjs --issue <n>`), which is
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
