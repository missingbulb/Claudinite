# Claudinite — the canon's own non-portable working rules

This is the Claudinite home repo's own local pack: the capture surface for lessons that are
**specific to working on the canon itself** and would not make sense mounted into a consuming
project. Portable lessons — anything true for repos beyond this one — belong in the shared canon
under `packs/`/`skills/` instead (proposed by PR, or lifted by the promote stage).

The growth lifecycle writes here automatically: the `growth-extract` daily task routes the canon's
own non-portable lessons — mined from repo activity and from captured conversations alike — into
this pack (each at the local promotion ladder's strongest mechanism — a check where the rule is
deterministic, otherwise terse prose below).

## Standing owner decisions — settled, do not re-litigate

- **Wondering where `canon-curation` belongs** — `.claudinite/local/packs/`, not `packs/`
  (owner decision, 2026-07-19): the canon home's curation duties are
  Claudinite-maintaining-Claudinite, project-specific content on the home's own capture surface.
  Don't propose moving it back, and don't describe the placement as open or provisional.

- **Describing local-pack `run_daily` scheduling** — it is ON, the fleet's default path (same
  decision): the planner reads every member's local-pack daily descriptors. Never reintroduce an
  "experimental / not enabled" framing or an opt-in seam for it.

- **Wanting a rule about what the `packs/` tree may reference** — express it by
  declaring/configuring the `barriers` pack (contributed edges, `siblings`/`scope` capabilities;
  extend barriers generically if the capability is missing). Never write standalone code that
  checks packs-tree segregation.

- **Writing a `docs/<initiative>/DESIGN.md`** — record the mechanism only (owner decision,
  2026-07-23, #420). Status, phase tracking, in-flight-PR reconciliation and remaining work live
  in that initiative's tracking issue; a phased plan lives in the sibling `MIGRATION.md`. Don't
  reintroduce a status / open-questions / remaining-work section there.

- **Ending a session on unfinished work** — update the tracking issue and let the session
  summary be a pointer to it (owner correction, 2026-07-23). The owner's opener is `continue work
  on #<n>`, so state not written into the issue is lost; never compose a bespoke "pick up from
  here" prompt.

- **Designing anything that spans repos** — split it in two: a self-contained per-repo half in
  the canon, and the aggregation half as a **Sheepdog** fleet task (owner correction, 2026-07-28,
  #520). The canon carries only mechanisms exercised on itself, and **no repo list exists anywhere
  in canon code** — which repos exist is Sheepdog's knowledge, enumerated at runtime from its
  own `.claudinite-checks.json` entry. A derived fleet artifact lands in Sheepdog as a daily
  **auto-merged PR of a `GENERATED` file**, never a direct commit to its `main`.

- **Choosing a value whose recommended answer is right for nearly every project** — keep it in
  the pack's own code: ask nothing at adoption, and write nothing into the member's config (owner
  ruling, 2026-07-28, #527/#528). Such a question is bad noise — it taxes every adopting repo to
  re-state the default, and materializing the answer into `.claudinite-checks.json` freezes a copy
  that drifts from the pack and has to be migrated. The rare project that wants to differ adds the
  setting by hand, so read config as *optional*: an unset key means "the default", never
  "misconfigured" (`retention_days` unset is why the growth-extract retention prune is skipped
  rather than failing).

- **Needing a member to flip a platform setting or hold a wider credential** — treat it as a
  last resort (owner ruling, 2026-08-06). Per-repo manual work reliably does not happen, and the
  capability is then quietly dead in every repo nobody configured, indistinguishable from a
  Claudinite bug while the automation's own report says nothing is wrong: three members filed
  issues asking for the same Actions approval setting (ClaudiniteWebsite#95, EdFringeNow#205,
  TLDR#182), none was changed, and each repo's converge kept succeeding while its mount fell a day
  behind. Prefer the route that works with the Action's own `GITHUB_TOKEN` and stock configuration
  even when it is less direct, and where a platform behaviour blocks you, neutralise its *effect*
  rather than asking for the platform to be reconfigured. Where no such route exists — a
  capability the default credential cannot hold at all, which is why `FLEET_GITHUB_TOKEN` is
  legitimate — take the requirement deliberately: name the exact scope, say why nothing weaker
  suffices, and have the automation report when it is missing rather than silently degrading.

- **Landing a change to what members receive** — force a member to receive it in the same
  session (owner requirement, 2026-08-06: *"We're not waiting till tomorrow to see if something
  worked"*). Merging to canon is evidence about canon; only a member's converge exercises the
  change end to end, and on a daily slot that is a day away — so closing on "it reaches the
  fleet tonight" ships an unverified change and hands the owner a question they ask anyway (five
  ways across 2026-08-05/06, plus forced baselines appended to three consecutive `lgtm`s). Drive
  Sheepdog's `fleet-baseline` workflow with `follow` and report what it did per member, unasked.
  **A dispatch is not a result** — the API's 204 means queued. And **attach the member repos the
  verification needs** rather than offering to; *"say the word and I'll attach and verify"* buys a
  round-trip.

- **Retiring a field, option or module** — put `@deprecated` on its **definition**, and have
  each sanctioned holdout pacify the warning with a comment at its own declaration site saying why
  it still carries the field (owner ruling, 2026-08-09, #707). Never author a bespoke conformance
  check for a deprecation: that is a rule module, test file and catalog row to say what one JSDoc
  line says, growing once per retirement forever. Keep the contract **validating** the lingering
  field either way — validation catches a typo that would strand a dispatch, and is not a
  conformance rule.

## Working with the owner and the session's tools

- **Answering "why did it fail?"** — lead with the throwing call site: `file:line`, the
  function, and which side enforced it. The owner is asking for the mechanism, not the sequence,
  and an answer that narrates the flow correctly but never names the line reads as unanswered —
  measured 2026-08-05 (#649), three rounds and ~10 minutes for one fact (`worker.mjs:429`,
  `execFileSync` on `git push`, refused **remote-side** on receipt). The local/remote half matters
  as much as the line: it is what says why nothing local — the commit, the suite, the sweep —
  saw it coming.

- **Reaching for `AskUserQuestion`** — spend it on a fork you cannot take back (an
  irreversible or fleet-touching step, a shape decision only the owner can make), never on a
  confirmation. It blocks for minutes at the same price either way: 20 calls, **3640s (60.7 min)**
  across 2026-08-14's captured sessions, median ~170s, including 327s on whether to watch a PR and
  173s on whether a typo was a typo. Anything answerable from the instruction, the tree, or a
  reversible default — answer it, act, and say what you assumed.

- **Resuming after an `AskUserQuestion` was declined or interrupted** — don't re-post the
  identical question: take the tool's own recommended default and state the assumption, or open
  the question up. A decline is signal that the closed choice set is wrong, not that the same
  choices need asking again — measured on the #801 session (2026-08-15), two questions each
  asked, declined, re-asked verbatim and declined again (4m40s + 4m36s, 4m07s + 14m00s), and
  neither was resolved by an offered option.

- **Being asked to "make this more general" or to review something** — land the conversions or
  action points it unlocks in the same change. A new capability ships with the caller that
  exercises it (an unexercised key is unproven surface), and an analysis ships with the first of
  its recommendations applied. The owner had to say so twice in one day — *"So what are your
  action points about 1-4?"* (#838) and *"But you didn't convert any checks... I thought this was
  the whole point."* (#843) — and the shape that satisfied him is #845's title, *"Six
  declarative-vocabulary keys and the four conversions they unlock"*.

- **Calling anything on `Claude_Code_Remote`** — one call per intent, ever: every call costs
  minutes, and a call that returns nothing has **not** failed. Measured over four sessions on
  2026-07-29, `add_repo` ran 270–285s, `send_later` 117–390s, `list_triggers` 139–325s,
  `delete_trigger` 286–301s. The duplicate a session issues after concluding the first call hung
  is the dominant cost — #562 spent 1121s of 1391s (81%) on 6 `add_repo` calls, #553 1107s of
  2028s on one check-in sent four times, #544 1854s of 2472s (75%). Budget them before making
  them: four is most of an hour. When what you want is "is it green yet", read the check status
  directly and merge on the already-green result rather than buying a notification. And to
  **read** a public sibling repo, `add_repo` is not the route at all — it attaches nothing and
  answers that the git proxy already serves anonymous reads (3m40s in #641, against ~2s for `git
  clone --depth 1 https://github.com/<owner>/<repo> /workspace/<owner>/<repo>`).

- **Waiting for something to happen** — the guard must name the condition being waited on (a
  run's status, a file's arrival, a deadline) with no trailing padded `sleep`, or use `Monitor`,
  which exists for this. `until <guard>; do sleep 5; done; sleep N & wait` gets invented to route
  around the foreground-`sleep` block, and the guard then gets picked for being *satisfiable*
  rather than for being the thing awaited: seven calls guarded by `[ -n "$(git ls-remote origin
  HEAD)" ]` — true on first evaluation, unrelated to what each said it was waiting for —
  burned **1342s (22.4 min)** of pure idle on the #768 session. A guard you would not be willing
  to write as the *whole* test is the tell that you are sleeping and calling it polling.

## Authoring packs, prose and checks

- **Writing a paragraph that explains how a mechanism works** — it does not go in a pack's
  `RULES.md`, which carries directives an agent must obey (owner correction, 2026-08-06: *"Rules
  are context for any agentic work, not for random explanations"*). The injection that makes the
  prose useful makes description expensive: a paragraph that only describes is paid for by every
  session in every declaring repo and steers none of them. Behaviour description belongs in the
  module header and the pack `README.md`; the test before a paragraph goes in is whether an agent
  could *act* differently for having read it.

- **Having a deferred direction, a blocked proposal or a status to record** — put it in
  `docs/` (e.g. `docs/future-directions.md`) and reference it from the issue or PR: an idea nobody
  can act on shouldn't cost context in every consumer session. **No file under `packs/` may link
  to `docs/`** — `docs/` is outside the vendor set, so the link resolves to nothing in every
  consumer (the `reference-integrity` class that reached `main` unnoticed in #424; that check is
  work-scoped, so it only sees paths the branch itself deletes).

- **Homing a lesson when no visible pack seems to own it** — read
  `packs/directory.GENERATED.md`, the catalog of **every** canon pack, never the mounted subset. A
  session sees only the packs its repo *declares*, so a pack that owns the territory can be simply
  absent, and the honest-looking reading ("nothing here covers this") is wrong in the direction
  that costs most: the lesson gets homed in a **new local pack**, duplicating canon territory.
  Measured 2026-08-09 on EdFringeNow — client-side data-caching rules belonging to
  `static-website` went into a fresh local pack (whose over-long `ruleRoutingGuidance.belongs`
  made the session's own selftest red) until the owner pointed at the pack by URL. Since #728
  every mount carries that catalog. Where the owning pack's territory is merely too narrow,
  **widen its `belongs`** rather than route around it: #727 widened `static-website` by two words,
  "shipping" → "shipping and serving", and the rules landed where they belonged. (Portable — a
  promote candidate for `grow_with_claudinite/extracting-lessons.md`, whose "route to the pack
  whose territory owns it" step assumes that pack is visible.)

- **Naming a new canon pack** — kebab-case, lowercase words joined by single hyphens, named
  for the **surface** it serves rather than the first feature you are building for it. The
  directory name is the pack's public id — members spell it in `.claudinite-checks.json`, a
  migration's `declarePacks` op seeds it, the catalog row and every cross-reference repeat it —
  so another casing is renamed later across all of them (`UserPreferencesStore` shipped in #567
  and cost a whole-pack rename to `claude-code-web-users-support`, which the same rename widened
  from one store to every Claude-Code-web capability). `grow_with_claudinite` is the single
  grandfathered exception: it sits in every member's declaration, so renaming it would be a fleet
  migration. (Convertible — a check over `packs/*/pack.mjs` directory names would carry the
  whole rule; left for the weekly prose-to-checks sweep, since a new rule moves
  `packs/README.md`'s tally.)

- **Looking for a skill here and not finding it in `.claude/skills/`** — read
  `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree instead, and never conclude "no
  such skill". `mount-skills.mjs` filters on the *literal* declaration (`isActive(p, { packs:
  declared })`), not the `requires` closure `check_the_world.mjs` resolves, and the home doesn't
  declare `git-github` — so `merge-to-main` and `git-github-advanced` are simply absent. The
  corpus *is* this repo, and an unmounted skill says nothing about whether its procedure applies.
  (Catching this needs `resolveDeclaredPacks` compared against the literal declaration.)

- **Adding or changing a check** — recompute `packs/README.md`'s "Hardcoded conformance
  checks" tally rather than taking a side of a conflict or bumping the higher number: discover the
  packs and count the active rules (`discoverPacks` + `run-active-pack-rules.mjs`), write that,
  re-run `packs-tests/catalog-tally.test.mjs`. It is a repo-wide aggregate every rule-adding PR
  must bump, so concurrent PRs always collide there and both sides are stale the moment a third
  merges (the same tally resolved three times in one day, 2026-07-31, #600/#593). Update **both**
  hand-maintained numbers — the pack's own catalog row and the corpus tally — and re-run the
  suite against **current** `main` immediately before merging: a PR that forgets the aggregate
  doesn't conflict at all, and #607 merged clean on a 12.5-hour-old green and left `main` red for
  everyone after it. (Portable — a promote candidate for `git-github`'s `merge-to-main`, which
  says nothing about merging on a stale green.)

- **Writing a check's `fix` text** — name only remedies that match the severity actually
  enforced; an advisory finding's remedies are act on it or leave it, never a config escape
  implying a gate nothing enforces. Sessions follow the words, not the `severity` field:
  `basics/file-placement` was advisory and never failed a run, but its `fix` offered a
  `.claudinite-checks.json` acceptance, and this repo alone accumulated eight paragraph-long
  acceptance entries for findings that blocked nothing (owner, #856: *"That is cost with no
  purchase"*; dropped in #858).

- **Declaring a check, or adding a key to the declarative vocabulary** — name the key so the
  declaration reads alone, cold, to someone who has not read the engine's design doc: the full
  noun phrase for what it holds (`scanFiles`, `matchLines`, `relevantWhen`, `unlessLineMatches`),
  never a short word that means something only to whoever built the vocabulary. **If it needs a
  comment to be read, it needs a better name** — and declarations live in
  `packs/<pack>/declared-checks.json`, a format that cannot hold a comment, so the rule holds by
  construction (owner, 2026-08-13, #789/#799/#800; #827). A declaration borrows nothing from
  prose: no `description` (*"the why section should stand on its own"*), no `doc` pointer, and the
  failure text is `failureMessage` — the line the agent reads when the check fires.

## The engine, the mount and what reaches members

- **Expecting the home to receive what the fleet receives** — it doesn't. Baselining's
  backfill of a `seededByDefault` pack (and of canon-delivered declaration changes) is gated
  `!isHome`, so this repo's own `.claudinite-checks.json` only ever changes by hand.

- **Writing a path, regex or workflow command against the mount** — write the two-root form up
  front: make the `.claudinite/(shared|local)/` prefix optional in a pattern, and in a command
  probe for `.claudinite/shared/` first, falling back to the repo root. A consumer runs the
  vendored engine under `.claudinite/shared/engine/…`; the home *is* the corpus and runs the
  same code from the repo root, so a mount-shaped path works fleet-wide and fails on exactly this
  repo — the last place anyone exercises it, so the break surfaces late.

- **Adding a module anywhere under `packs/`** — keep it import-light, and start any work
  *after* evaluation completes (`check(…).catch(…)`), never in a top-level `await`.
  `discoverPacks` imports every `packs/<name>/pack.mjs` on disk and `scanSkillChecks` every
  `<pack>/skills/<skill>/checks.mjs` beside it, *before* activation is consulted — so the whole
  import graph loads in every repo under every declaration, and a module that is also a CLI entry
  point is re-imported while still evaluating: its top-level `await` never settles and Node exits
  13 having run nothing (#581 — `interview.mjs check` deadlocked fleet-wide, invisible because
  the SessionStart orchestrator's fail-soft reads it as a merely-absent note). Enforced by
  `pack-discovery-entry-await`, which cannot check the import-weight half.

- **Tightening a contract that member-owned files must satisfy** — first ask what carries it
  across the fleet; if the answer is "nothing", the change is not ready. Vendoring refreshes
  `.claudinite/shared/` only, and a member's `.claudinite/local/packs/<pack>/pack.mjs` is content
  no converge may edit; `migrations/` records a *path relocation* (`aliases`, applied by
  `applyFileAliases`) and cannot express "the field `rules` is now `worldRules`/`workRules`" —
  exactly what #555 tightened with no record to ship. Accept the legacy shape in
  `normalizeManifest` (and say so) until a carrier exists, and never let a stale declaration
  degrade to **fewer checks running** rather than a failure: `normalizeManifest` rebuilt `rules`
  from the scoped keys only, so a legacy manifest's array became `[]` and that pack's checks
  silently stopped — **eleven local packs across ten of thirteen members** rewritten by hand in
  one session (2026-07-30).

- **Extending what a copied stub reads** — make the new config key **optional**, and let
  declaring it be the signal a staleness check can see. `packs/*/stubs/` are copied into a
  member's `.github/` once and never re-copied, so a stub that learns a new key is invisible to
  every repo holding the old copy: the config names it, the action ignores it, the run goes green,
  the feature is silently dead. `build_vars` (#729) is the shape — optional, so no existing
  config is invalidated and nobody must be migrated; **declared-but-unset fails the run** rather
  than exporting `""`, which would reproduce the silent death one level down; and
  `release-workflows` flags exactly the combination that reads the key against a copy predating
  the exporter, so opted-in repos are told to re-copy and nobody else sees a finding.

- **Writing a migration record that needs engine behaviour newer than the record** — make
  `appliesTo` **probe the member's own mount** for that capability and stay inert until it reads
  back (#652), self-healing in two cycles with no manual step. The record always comes from a
  fresh canon clone, but the worker that commits and pushes its result is the member's
  **vendored** one, frozen at its last successful converge — so a record needing a newer engine
  deadlocks: the record fires, the converge fails, the mount never advances, and the fix that
  would unblock it can only arrive through the converge the record is breaking
  (`sheepdog-fleet-baseline` wedged Sheepdog twice, the second time *after* the fix had merged to
  canon). Probe by **content**, not by version — the stamp covers the whole mount and says
  nothing about which engine change is in it — and fail **safe**: an unreadable or missing mount
  file must read as "not capable", delaying one record rather than wedging the repo.

- **Changing an export in `updates/*`** — empty it, never remove it: it is a live
  cross-version API. A member runs its own **vendored** worker while the flow modules that worker
  `load()`s come from a fresh canon clone, so within one call the callee is current and the caller
  is stale, with no version gate. Deleting `applyStageBrief` (#802) threw *after* the update PR
  was opened — the update never completed, the mount never refreshed, and the member therefore
  never received the worker that would stop calling it: a permanent fleet-wide wedge on the first
  cycle. Keep it callable until no fielded worker calls it, let it return something nothing reads,
  say at its definition that it exists to be callable rather than useful, and pin the flow surface
  with a test — **the canary rehearsal structurally cannot catch this class**, since by design
  it drives the worker *this ref ships*. **Give the shim an expiry in that same test** (an engine
  version by which someone re-checks), because nothing else ever reminds you — and **retire it
  by reading the field**: the condition is "no member's *vendored* worker calls it", which only
  the members' repos answer.

- **Changing a vendored stub** — edit the canon's own `.github/workflows/` copy in the **same
  commit**, and diff the two whole files rather than just the lines you came for. Every member
  gets `engine/scheduler/stubs/claudinite-scheduler.yml` written in by its nightly converge; the
  canon has no converge, so its copy is hand-maintained and drifts — invisibly until it is a
  permission denial in production (the canon sat on `actions: read` while the stub had carried
  `write` since store-release; the CI dispatch 403'd and only the canon's own fold PR stranded,
  for ten days, #535/#704). Paired tests are not the net you think: one already asserted the
  `overrides` input on both files and said nothing about `permissions`.

- **Excluding files from the vendor set by pattern** — whitelist any operational file that
  matches by path (`VENDORED_ENGINE_DOCS`) **and** pin it with a test asserting against the
  **real** canon tree, not only a synthetic fixture. The nightly self-refresh re-runs
  `vendoring/compute-vendor-set.mjs` from canon HEAD, so a bug *in that computation* is the one
  class of canon regression that is not self-healing — every refresh reproduces it, and recovery
  is a hand-applied vendor refresh per member. A fixture keeps proving the whitelist mechanism
  works while the live path drops out from under it (see the paired tests in
  `vendoring/compute-vendor-set.test.mjs`).

- **Branching on the result of an API write in fleet machinery** — read its **status**, not
  just the body, and judge the fleet by members' **stamps** rather than by run conclusions. The
  update delivery destructured only `json` from the PR-open POST, so a 403 put the error body in
  `pr`, left `pr.node_id` undefined, skipped the auto-merge arm silently — and the run logged
  `ok`. It compounds because `openMaintenancePull` reuses by open **PR**, not by branch, so a
  cycle that pushes a branch and fails to open its PR mints a fresh one nightly: **eleven of
  twelve consumers frozen on one canon ref, 27 orphan `claudinite/maintenance-*` branches** over
  2026-07-29/30, every nightly run green throughout, detected by the owner's feel. The stamp is
  the only artifact that moves when delivery actually worked, which is why a stamp-staleness alarm
  (#331) is the missing guard.

- **Judging whether a member is fresh** — read its `ref` (or, on the versioned-updates flow,
  its `engineVersion` / `packVersions` — #786 tracks the sweep that still doesn't), never
  `claudinite.updated` alone. `heldStamp()` pins `updated` to the day before a repo's earliest
  pending agentic note (#330), so a mount converging normally every hour can show a week-old
  `updated` — the mechanism working, not a dead repo. Misread live 2026-08-12 (#768) on
  ClaudiniteCanary and GoogleCalendarEventCreator, where the tell was in the same object: a
  bare-midnight `updated` beside a `ref` naming yesterday's canon commit.

- **Adding a fleet task** — have it **fail loudly on a Context target it cannot reach**, and
  treat a member as un-adopted until the routine's repo scope names it. The target list is
  enumerated dynamically over `FLEET_GITHUB_TOKEN` (`engine/scheduler/signals/fleet.mjs`) while
  the executor routine's reachable-repo grant is hand-typed UI config no Action can read, so the
  two drift wider with every adoption — and the drift *completes* rather than fails: on #602 the
  dispatch named 12 members to a grant listing 10, and `growth-promote` (which reads members over
  the API, never a checkout) would have noted two denials and filed a PR reading as a complete
  12-member sweep. No check can catch either half; this is routine config, not repo content.

- **Diagnosing a member's maintenance PR that won't land** — read the member first: `unstable`
  beside a green sweep is a **parked** run, not a missing repo setting. GitHub gates
  `pull_request` runs on Actions-pushed branches at `action_required`, a parked run never reports,
  so `enablePullRequestAutoMerge` refuses. Propose a platform-settings change only as a
  **conclusion**, never as a diagnosis — on #676 a session read that signature as the fleet
  lacking *"Allow GitHub Actions to create and approve pull requests"* and was wrong; the two
  reads that settled it took under a minute (each member's raw `.claudinite-checks.json`, all
  eight already `delivery: auto-merge`; and the head sha's `pull_request` runs, 4 of the last 5
  parked). Sibling of the standing credentials ruling above — that one is about what to *build*,
  this about what to *believe*.

## Scheduled tasks

- **Choosing a task's cadence** — pick it from how often its signal actually moves. A member's
  mounted canon changes most nights, so any precondition reading `sharedMount` fires nearly every
  night and spends an opus dispatch on it; where the work isn't latency-sensitive (pruning, dedup)
  a stale item stays harmlessly correct, so daily buys noise, not freshness. `growth-dedup` moved
  to `weekly` in #583 and loses nothing: signals are window-scoped (`sinceIso`) and `windowStart`
  widens to the widest due task's period, so a weekly run sees all 7 days batched rather than
  dropped.

- **Writing a task's precondition** — gate on the objects' own movement in the window (a
  `touched` list, a tip-commit date — which the signal collector has to actually carry), never
  on standing state. "An open PR exists" is true forever once true, so the task wakes every night
  and re-derives yesterday's verdict over an unchanged set (three of tidy-repo's tasks shipped
  that way; fixed in #554). A signal true most days on an active repo — a substantive `main`
  move — may only **widen** an already-triggered run, never wake one. And the gate is not the
  scope: where a verdict is relative to the rest of the set (superseded-by, already-in-`main`),
  newness gates and the full set stays the scope. (Portable — a promote candidate for
  `core/scheduled-tasks.md`.)

- **Writing a task whose output is a regenerated file** — land it through
  `engine/scheduler/deliver-generated.mjs` (git plumbing against the fetched base tip, HEAD, index
  and working tree untouched) and read its prior state from that base rather than local HEAD, so
  stacked runs stay idempotent. Every due task in a run shares **one** checkout, so a worker that
  checks out a branch or leaves an index behind hands the next task a tree it did not expect, and
  a run that dies leaves the mess for whatever follows. (`basics/baselining`'s deliver is the
  deliberate exception — it commits a whole working tree and re-cuts a dated family branch; the
  landing itself is shared, in `engine/scheduler/land-pr.mjs`.)

- **Spawning a child process from a worker** — give it an explicit `cwd` (`node([…], env, {
  cwd: root })`) and resolve a root that cannot vanish underneath you (`--root`, then
  `CLAUDE_PROJECT_DIR`, then `cwd` — the order `check_the_world` and `engine/selftest.mjs` now
  share). The converging task's prework runs with its cwd *inside* the mount the converge
  `rmSync`s, and on Linux the worker and its children survive on the unlinked inode — so
  `check_the_world` died at `process.cwd()` with `ENOENT … uv_cwd` **before running a single
  check**, on every night that actually converged, while `escalation()` folded the crash into
  `checks-could-not-run` and every run looked fine (#689/#691). Corollary: **when a crash and a
  benign state share one outcome code, the crash is unobservable** — keep "could not run"
  distinguishable from "had nothing to run".

- **Wanting to exercise a task Action-side** — invoke its worker directly, or move the slot
  hour in `taskScheduler` and wait for the cron. You cannot force a due slot by running the
  scheduler workflow by hand: dueness is stateless (a slot is due iff its time falls in `(last
  successful run, now]`), so a `workflow_dispatch` outside the window succeeds, prints `- no tasks
  due`, and does nothing — looking exactly like a healthy run.

## Proving a change: tests, checks and surveys

- **Testing a change to a task's triggering** — drive the real `planRun` from a deliberately
  **non-due** slot. A task is gated twice, and `planRun` computes the due list *before* any
  precondition runs, so a test that starts inside the gate proves only "works once evaluated":
  #513's forced-run override landed with every test driving the precondition directly and was
  inert on exactly the run it existed for (`evaluations: []`; fixed in #516).

- **Testing a fail-soft step** — assert the **positive** effect (the output IS emitted), never
  `status === 0`, which fail-soft makes meaningless. Every `engine/pack_loader/` SessionStart step
  wraps its body in `try { ... } catch {}`, so a runtime fault — a wrong dynamic-import target,
  a renamed module — exits 0 and emits nothing: no error, no signal. And because the engine is
  vendored verbatim, one canon regression silently disables that step across the whole fleet. Run
  the real script against a real corpus; see
  `engine-tests/pack_loader/run-pack-session-start.test.mjs`.

- **Writing or reviewing a check that selects its inputs by path pattern** — add one assertion
  over the **real** tree that its scope is non-empty. `skill-no-enforcement-narration` kept
  scanning the root-level `skills/<name>/SKILL.md` layout after skills moved into their packs
  (#385): it matched nothing, read as live, and caught nothing until a human noticed (#560 — 21
  skills in scope once repointed), and its five green fixtures hid it by spelling the same dead
  layout, proving the *matching* and never the *selection*. Same class: grep the tree for any
  directory you name in a finding, a remedy or a doc pointer before shipping it — the same PR
  fixed a rule naming `engine/checks_helpers` and `checks/lib`, neither of which ever existed, and
  `reference-integrity` is work-scoped so it flags only paths the branch itself deletes.

- **Testing a helper that gets reapplied across a hand-off, a re-queue or a retry** — call it
  twice and assert no duplication; a suite of single-call tests stays green while the multi-call
  case corrupts state. `withSection` appended a same-named section instead of replacing it, so a
  work-item body written at birth and again at hand-off carried two `### Context` sections against
  an `instructions.md` that says "the issue's Context section", singular — whichever a session
  read first, the other's content vanished (#881). Every existing unit test passed, and `rollBody`
  had already hand-stripped its own section at one of its two call sites, a workaround nobody
  generalized.

- **Running the test suite** — enumerate from git: `node --test $(git ls-files '*.test.mjs')`.
  There is no `package.json` and no test script, so every hand-written glob under-runs the suite
  silently: `node --test <dir>` does not recurse (it resolves the path as a module and dies with
  `Cannot find module`), and bash `**` without `globstar` reaches **37 of 65** tracked test files.
  Four consecutive sessions (2026-07-26) each invented a command and reported 587, 690, 621 and
  697 tests, three of them pushing on a strict subset. Neither published list is authoritative
  either — `ci.yml`'s `tests=(…)` array omits `vendoring/*.test.mjs`, and
  `engine/checks/README.md` names directories that don't exist. (The drift-guard, once the array
  is clean: assert every tracked `*.test.mjs` is matched by `ci.yml`'s globs.)

- **Surveying whether something exists in the tree** — a code-search hit is evidence; a
  code-search miss is not. Survey by reading each file.

## Editing, branching and merging here

- **Editing a repo's JSON config** — patch the text as anchored edits; never re-serialize. A
  round-trip rewrites what it wasn't asked to — Python's `json.dump` defaults to
  `ensure_ascii=True`, turning every non-ASCII character into a `\uXXXX` escape, and indent, key
  order and the trailing newline become the serializer's opinion — while nothing fails and tests
  stay green. If you must round-trip, pin every lossy default and read the resulting diff before
  committing. (Portable — a promote candidate for `repo-text-sweeps`, where a
  `\uXXXX`-in-tracked-JSON check would carry it.)

- **Returning to a branch that waited** — after `git fetch`, re-verify the **premise**,
  unasked: read what the new commits did to the surface you are changing, and state whether the
  problem is still there, what the goal was, and what survives. Syncing the base is not the check.
  This repo merges its own scheduled-task PRs without a human on top of multi-phase migrations
  that retire whole directories — `main` moved **14 commits in 13.7 hours** under PR #465, one
  of them deleting the file that PR's diagnosis rested on; the branch rebased cleanly and stayed
  green while no longer being the change to make, and the right move was `git checkout -B <branch>
  origin/main` and re-applying only the surviving slice (9 files → 2). The owner should never
  have to ask "is this change still needed" (asked three times on #465).

- **Re-applying your edit onto a moved `main`** — re-read the fetched file, apply the same
  anchored edit to it, and confirm the stat shows insertions only. Never restore a whole-file
  copy: a pack's `RULES.md` is append-only and several auto-merged runs write it a day, so a `cp`
  of the version you read deletes their lessons — and nothing goes red, because no test or check
  reads prose (caught by luck on 2026-08-11/#758, 54 lines already staged).

- **Syncing local `main`** — `git fetch origin main && git reset --hard origin/main`,
  unconditionally; never `git pull`. This repo's session clones are shallow, so there is no common
  ancestor with the fetched remote and `git pull` either demands a strategy or reports the stale
  local ref as carrying unique commits — and the tempting reading, "local `main` has work the
  remote lacks", is wrong every time: the session's own work is already *in* `origin/main`, which
  is why it just merged. It bit five sessions on 2026-07-29 alone (#548, #551, #537, #559), one
  spending 87s re-deriving it from scratch. Nothing of value is ever on this repo's local `main`.
  (Portable — a promote candidate for `git-github`'s merge procedure.)

- **Merging in a session that has a consumer repo in its sources too** — resolve the merge
  skill **by target repo**, not by which skill matched first. Canon work is routinely dual-repo,
  both repos ship a merge skill under different names (the canon's `merge-to-main`; a member's
  local `merge-and-ci`), and the consumer's wins the match and is followed to the letter —
  silently skipping the canon-only steps, repeatedly the **post-merge conversation capture**
  (`node packs/grow_with_claudinite/capture-log.mjs --issue <n>`). Treat capture as part of the
  merge, not an optional epilogue.

- **Having work that completes or corrects an open PR** — put it on that PR's branch. A
  dispatch prompt's designated branch routes work, not review, and splitting gives the owner two
  gates for one decision and invites approving half — #739's new pack was approvable while
  `basics` still held a rule the pack owned.

- **Wanting to combine two PRs** — update the one you're keeping and close the other; never
  push one's branch onto the other's base (owner decision, 2026-08-11). GitHub marks a PR merged
  the moment its head is reachable from its base, so the push merges it under your name into a
  branch that is itself an open PR's head, and a later `state: closed` is a no-op. Check the API's
  `merged` field before reporting (#754).

- **Being asked "should no X decide this?"** — it is a question about whether the decision
  exists at all; never answer it by relocating the knob one rung out. Ask **who would ever set it
  differently, and why that could not be read off the structure**; a single structural answer
  means delete the field and document the exception where it lives. On #707 the task-level
  `session_scope` was questioned and the same choice moved up to the pack manifest as
  `sessionScope: 'fleet'` — a vocabulary entry, a resolver module, wiring, a fixture and tests,
  all authored, pushed and deleted one round later on *"Who does this help?"* — when the reach
  was already implied by **which repo runs the task**, and the field protected one structural
  holdout. Cousin of the standing "a pack default stays in the pack" ruling: both refuse to
  materialize a decision nobody has to make.

- **Facing a retry across a call whose outcome you cannot observe** — check whether
  **declining to retry** removes the uncertainty before building dedup or arbitration machinery to
  manage it. The work-item queue's first design treated the dispatch API as at-least-once and
  built an agent-side claim/lease to arbitrate the duplicate a timeout retry could produce; owner
  correction (#854, 2026-08-15): *"the API should be called once per item... a retry is only safe
  when you know the first call did nothing, and the timeout is exactly the case where you
  cannot."* Declining made invocation at-most-once, and the claim/lease had nothing left to
  collapse — outcomes reduced to "refused" (definite) and "unanswered", which an
  already-existing janitor rule sweeps.
