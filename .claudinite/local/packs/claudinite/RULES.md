# Claudinite — the canon's own non-portable working rules

This is the Claudinite home repo's own local pack: the capture surface for lessons that are
**specific to working on the canon itself** and would not make sense mounted into a consuming
project. Portable lessons — anything true for repos beyond this one — belong in the shared canon
under `packs/`/`skills/` instead (proposed by PR, or lifted by the promote stage).

The growth lifecycle writes here automatically: the `growth-extract` daily task routes the canon's
own non-portable lessons — mined from repo activity and from captured conversations alike — into
this pack (each at the local promotion ladder's strongest mechanism — a check where the rule is deterministic, otherwise terse
prose below).

## Standing owner decisions — settled, do not re-litigate

- **`canon-curation` lives in `.claudinite/local/packs/`, not `packs/`** (owner decision,
  2026-07-19). The canon home's curation duties are Claudinite-maintaining-Claudinite —
  project-specific content on the home's own capture surface. Do not propose moving it back, and
  do not describe the move as open or provisional.
- **Local-pack `run_daily` scheduling is ON — the fleet's default path** (same decision). The
  planner reads every member's local-pack daily descriptors by default; never reintroduce an
  "experimental / not enabled" framing or an opt-in seam for it.
- **Packs-tree segregation is barriers configuration only.** Any rule about what the `packs/`
  tree may reference is expressed by declaring/configuring the `barriers` pack (contributed
  edges, `siblings`/`scope` capabilities — extend barriers generically if a capability is
  missing). Never write standalone code that checks packs-tree segregation.
- **A `docs/<initiative>/DESIGN.md` records the mechanism only** (owner decision, 2026-07-23,
  #420). Status, phase tracking, in-flight-PR reconciliation and remaining work live in that
  initiative's tracking issue (task-prework → #394); a phased plan lives in the sibling
  `MIGRATION.md`. Don't reintroduce a status / open-questions / remaining-work section there.
- **Multi-session work hands off through the tracking issue, never a prepared prompt** (owner
  correction, 2026-07-23). The owner's opener is `continue work on #<n>`, so state not written
  into the issue is lost. Before ending a session on unfinished work, update the issue and let
  the session summary be a pointer to it — never compose a bespoke "pick up from here" prompt.
- **The canon never knows which repos consume it — fleet-wide aggregation is Sheepdog's domain**
  (owner correction, 2026-07-28, #520). Designing anything that spans repos, the tempting shape is
  a member list (or a "fleet" task) living in the canon. It doesn't go here: the canon carries only
  **mechanisms exercised on itself**, and the knowledge of *which* repos exist stays in the
  **Sheepdog** repo and its pack, which enumerates members at runtime from its own
  `.claudinite-checks.json` entry — exactly where the `fleet-roster` sweep already keeps
  it. So a cross-repo feature splits in two: a self-contained per-repo half in the canon, and the
  aggregation half as a Sheepdog fleet task. **No repo list exists anywhere in canon code** — and a
  derived fleet artifact lands in Sheepdog as a daily **auto-merged PR of a `GENERATED` file**,
  never a direct commit to its `main`.
- **A pack default stays in the pack — don't ask it at adoption, don't write it into a member's
  config** (owner ruling, 2026-07-28, #527/#528). An adoption question whose recommended answer is
  right for nearly everyone is "bad noise": it taxes every adopting repo to re-state the default,
  and materializing that answer into `.claudinite-checks.json` freezes a copy that then drifts from
  the pack and has to be migrated. Keep the default in the pack's own code, ask nothing, and let the
  rare project that wants to differ add the setting by hand. Read config as *optional* — an unset
  key means "the default", never "misconfigured" (`retention_days` unset is precisely why the
  growth-extract retention prune is skipped rather than failing).

- **What Claudinite ships must run on the credentials and settings a member already has**
  (owner ruling, 2026-08-06). Requiring a member to flip a platform setting, or to provision a wider
  credential (a PAT, an app installation, a new secret), is a last resort — not because it is hard,
  but because it is per-repo manual work that reliably does not happen: the capability is then
  quietly dead in every repo nobody configured, indistinguishable from a Claudinite bug, while the
  automation's own report says nothing is wrong. Three members filed issues asking for the same
  Actions approval setting (ClaudiniteWebsite#95, EdFringeNow#205, TLDR#182); none was changed, and
  each repo's converge kept succeeding while its mount fell a day behind. Prefer the route that
  works with the Action's own `GITHUB_TOKEN` and stock configuration even when it is less direct,
  and where a platform behaviour blocks you, neutralise its *effect* rather than asking for the
  platform to be reconfigured. Where no such route exists — a capability the default credential
  cannot hold at all, which is why `FLEET_GITHUB_TOKEN` is legitimate — take the requirement
  deliberately: name the exact scope, say why nothing weaker suffices, and have the automation
  report when it is missing rather than silently degrading.

- **A change to what members receive is not verified until a member has received it — force that in
  the same session** (owner requirement, 2026-08-06: *"We're not waiting till tomorrow to see if
  something worked"*). Merging to canon is evidence about canon; the only thing that exercises a
  canon change end to end is a member's converge, and on a daily slot that is a day away — so a
  session that closes on "it reaches the fleet tonight" has shipped an unverified change and hands
  the owner a question they will ask anyway (asked five separate ways across 2026-08-05/06:
  *"Check status"*, *"Did the Sheepdog baselining work?"*, *"check now"*, *"How do you know 'the
  fleet is now fully on 076c029'?"*, and forced baselines appended to three consecutive `lgtm`s).
  After landing anything that alters what baselining delivers, drive Sheepdog's `fleet-baseline`
  workflow with `follow` and report what it did per member, unasked. Two corollaries. **A dispatch
  is not a result** — the API's 204 means queued. And **attaching a member repo to the session is a
  read you already have**, so attach the repos the verification needs rather than offering to: *"2
  of 11 members confirmed … say the word and I'll attach and verify"* bought a round-trip, one of
  four the owner spent that morning telling this session to attach repos.

- **A code deprecation rides the standard `@deprecated` tag — never a bespoke conformance check**
  (owner ruling, 2026-08-09, #707). Retiring a field, option or module does not earn its own rule
  module, test file and catalog row: that is machinery to say what one JSDoc line says, and it grows
  once per retirement forever. `deprecated-session-scope` was authored as a `basics` check and deleted
  the same day it was reviewed (*"I don't think we want to add a check for every code deprecation"*).
  Put `@deprecated` on the **definition** — the one place the thing is declared, here the
  `session_scope` section of `engine/scheduler/task-contract.mjs` — and have each sanctioned holdout
  pacify the warning with a comment at its own declaration site saying why it still carries the field.
  Keep the contract **validating** the lingering field either way: validation catches a typo that would
  otherwise strand a dispatch, and is not the same thing as a conformance rule.

## Canon-specific gotchas

- **Baselining backfill skips the home.** The nightly baselining that lands a `seededByDefault`
  pack (and canon-delivered declaration changes) on every member is gated `!isHome`, so the canon
  home is the one repo it never reaches: what the fleet receives automatically, this repo's own
  `.claudinite-checks.json` only ever gets by hand.
- **Pack discovery imports the whole pack tree eagerly — declaration is irrelevant.**
  `discoverPacks` imports every `packs/<name>/pack.mjs` on disk and `scanSkillChecks` imports
  every `<pack>/skills/<skill>/checks.mjs` beside it, *before* activation is consulted. So
  anything in that import graph loads in every repo under every declaration, and a module that is
  also a CLI entry point gets re-imported while it is still evaluating: a top-level `await` in its
  entry block then never settles and Node exits 13 having run nothing (#581 — `interview.mjs
  check` deadlocked fleet-wide, invisible because the SessionStart orchestrator's fail-soft reads
  it as a merely-absent note). Start the work *after* evaluation completes — `check(…).catch(…)`.
  Enforced by `pack-discovery-entry-await`; the corollary it can't check is to keep these modules
  import-light in the first place.
- **A pack's `RULES.md` is injected into every session that declares the pack — an idea nobody can
  act on belongs in `docs/`, and a pack file must not link there.** Deferred directions, blocked
  proposals and status live in `docs/` (e.g. `docs/future-directions.md`) precisely because pack
  prose costs context in every consumer session. And the pointer cannot go the other way: `docs/`
  is outside the vendor set, so a link from any file under `packs/` resolves to nothing in every
  consumer — the `reference-integrity` class that reached `main` unnoticed in #424 (and that
  check is work-scoped, so it only sees paths the branch itself deletes). Reference `docs/` from
  the issue or PR instead.
- **A pack's `RULES.md` carries directives an agent must obey — never a walkthrough of how the
  feature works** (owner correction, 2026-08-06: *"Rules are context for any agentic work, not for
  random explanations"*). The same injection that makes the prose useful makes description
  expensive: a paragraph that only *describes* a mechanism is paid for by every session in every
  declaring repo and steers none of them. Shipping the fleet-baseline `follow` half, the rule the
  change actually added was one sentence — the two extra PAT read scopes a followed run needs —
  and everything around it was a feature tour. Behaviour description goes in the module header and
  the pack `README.md`, read by whoever works on that code rather than loaded ambiently; the test
  before a paragraph goes in is whether an agent could *act* differently for having read it. Same
  instinct as the comment rule `basics` now carries (describe the current state, not the change),
  applied where the cost is per session rather than per reader.
- **Pick a scheduled task's cadence from how often its signal actually moves.** On a member the
  mounted canon changes most nights — baselining converges `.claudinite/shared/` daily — so any
  precondition reading `sharedMount` fires nearly every night, spending an opus dispatch per
  firing. Where the work isn't latency-sensitive (pruning, dedup), a stale item stays harmlessly
  correct, so daily buys noise, not freshness: `growth-dedup` moved to `weekly` in #583 and loses
  nothing, because the signals are window-scoped (`sinceIso`) and `windowStart` widens to the
  widest due task's period — a weekly run sees all 7 days, batched rather than dropped.
- **The home doesn't declare `git-github`, so its skills never mount — never conclude "no such
  skill" from `.claude/skills/`.** `mount-skills.mjs` filters on the *literal* declaration
  (`isActive(p, { packs: declared })`), not the `requires` closure `check_the_world.mjs` resolves,
  and the baselining that would normalize that closure into `.claudinite-checks.json` is the one
  thing gated `!isHome` — so `merge-to-main` and `git-github-advanced` are simply absent here.
  Read `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree — the corpus *is* this repo,
  and an unmounted skill says nothing about whether its procedure applies. The seeding gap above
  is a different one (`git-github` arrives by closure, never `seededByDefault`); catching this
  one needs `resolveDeclaredPacks` compared against the literal declaration.
- **The same blindness on the member side: a session sees only the packs its repo *declares*, so never
  conclude from the mount that no canon pack owns a lesson.** A member's `.claudinite/shared/packs/`
  holds its declared set, not the canon — so a pack the repo doesn't declare is simply absent, and the
  honest-looking reading ("nothing here covers this") is wrong in the one direction that costs most:
  the lesson gets homed in a **new local pack** on the member, duplicating canon territory. Measured
  2026-08-09 on EdFringeNow: the client-side data-caching rules that belonged to `static-website` went
  into a fresh local pack (whose `ruleRoutingGuidance.belongs` ran 31 words against the 20-word cap, so
  the session's own selftest was red), because the repo carries no `site.config` and doesn't declare
  the pack — nothing in the session pointed at it. The owner did, by URL: *"That pack does exist … move
  the changes into that pack and cleanup the EdFringeNow rules."* Since #728 every mount carries
  `packs/directory.GENERATED.md`, the catalog of **every** canon pack — read that, not the mounted
  subset, before homing a lesson locally. And when the owning pack's territory is merely too narrow,
  **widen its `belongs`** rather than route around it: #727 widened `static-website` by two words,
  "shipping" → "shipping and serving", and the rules landed where they belonged. (Portable — a promote
  candidate for `grow_with_claudinite/extracting-lessons.md`, whose "route to the pack whose territory
  owns it" step assumes that pack is visible from the session.)
- **Never re-serialize a repo's JSON config to apply an edit — patch the text.** A round-trip
  rewrites what it wasn't asked to: Python's `json.dump` defaults to `ensure_ascii=True` (every
  non-ASCII character becomes a `\uXXXX` escape), and indent, key order and the trailing newline
  become the serializer's opinion. Nothing fails and tests stay green, so it rides onward. Edit
  JSON as anchored text; if you must round-trip, pin every lossy default and read the resulting
  diff before committing. (Portable — a promote candidate for `repo-text-sweeps`, where a
  `\uXXXX`-in-tracked-JSON check would carry it.)
- **Test git fixtures must commit with signing off.** `engine-tests/helpers.mjs`'s `makeRepo`
  overrides identity but not signing, so all 31 call sites route fixture commits through the
  signing service; when it degrades, each commit blocks on it and the suite leaks descriptors
  (~800 per full run against a 4096 cap) until `git commit` and `git push` fail process-wide.
  Commit with `git -c commit.gpgsign=false commit --no-gpg-sign`: signing a tmpdir throwaway
  buys nothing. (Portable — a promote candidate for `writing-tests`.)
- **A canon session with a consumer repo also in its sources will reach for the *consumer's*
  merge skill — merge by the skill of the repo you are merging into.** Canon work is routinely
  dual-repo (the canon plus the fleet member being piloted), and both repos ship a merge skill
  under different names — the canon's `packs/git-github/skills/merge-to-main/` and, say, GCEC's
  local `merge-and-ci`. The consumer's skill wins the match on name/description and is followed
  to the letter, so the canon-only steps in *its* recipe are silently skipped — repeatedly, the
  **post-merge conversation capture** (`node packs/grow_with_claudinite/capture-log.mjs --issue
  <n>`, the "After the merge" section of `merge-to-main`). So: before merging in a dual-repo
  session, resolve the merge skill **by target repo**, not by which skill matched first — and
  treat capture as part of the merge, not as an optional epilogue.
- **Fail-soft SessionStart steps hide their own breakage fleet-wide — test the emitted
  output, not the exit code.** Every `engine/pack_loader/` SessionStart step
  (`inject-pack-prose.mjs`, `mount-skills.mjs`, `env-requirements.mjs`) wraps its body in
  `try { ... } catch {}` so a broken loader never blocks a session. That fail-soft is deliberate,
  but it means a runtime fault — a wrong dynamic-import target, a renamed module — exits 0 and
  simply emits nothing: no error, no signal. And because the engine is vendored verbatim into
  every member, one canon regression silently disables that step across the whole fleet at once.
  So a step like this must be guarded by a regression test that runs the real script against a
  real corpus and asserts the **positive** effect — prose IS emitted — never merely that
  `status === 0` (which fail-soft makes meaningless); see
  `engine-tests/pack_loader/inject-pack-prose.test.mjs`.
- **The nightly self-refresh cannot repair the vendor-set computation — pin operational
  files against the REAL canon tree.** Baselining's converge re-runs
  `vendoring/compute-vendor-set.mjs` from canon HEAD, so a bug *in that computation* is
  the one class of canon regression that is not self-healing: every refresh faithfully
  reproduces it, and recovery is an out-of-band vendor refresh applied to each member by
  hand. So when the vendor set excludes by *pattern*, an operational file that matches
  needs a by-path whitelist (`VENDORED_ENGINE_DOCS`) **and** a regression test asserting
  against the real canon tree, not only a synthetic fixture: a fixture keeps proving the
  whitelist mechanism works while the live path silently drops out from under it (see the
  paired tests in `vendoring/compute-vendor-set.test.mjs`).
- **A check that selects its inputs by path pattern can reach zero files and still pass — assert
  the live in-scope count.** When skills moved inside their owning pack (#385),
  `skill-no-enforcement-narration` kept scanning the root-level `skills/<name>/SKILL.md` layout: it
  matched nothing in any tree, read as live, and caught nothing until a human noticed the prose it
  should have flagged (#560 — 21 skills in scope once repointed). Its fixtures are why it hid so
  well; they spelled the same dead layout, so five green tests proved the *matching* and never the
  *selection*. A scan-based check therefore needs one assertion over the **real** tree that its
  scope is non-empty. Other half of the same class: agent-facing text pointing where the code isn't
  — the same PR fixed a rule whose `why`, fix text and `doc` all named `engine/checks_helpers` or
  `checks/lib`, neither of which ever existed. Nothing catches that on its own —
  `reference-integrity` is work-scoped and flags only paths the branch itself deletes — so grep the
  tree for any directory you name in a finding, a remedy, or a doc pointer before shipping it.
- **A scheduled task's precondition gates on movement in the window, never on standing state.** "An
  open PR exists" is true forever once it is true once, so the task wakes every night, spends an
  agent, and re-derives yesterday's verdict over an unchanged set (three of tidy-repo's tasks
  shipped that way; fixed in #554). Gate on the objects' own movement — a `touched` list or a
  tip-commit date, which the signal collector has to actually carry (`branches` carried names only,
  so "is any of this new" had no answer at all). A signal that is true most days on an active repo
  — a substantive `main` move — may only **widen** an already-triggered run, never wake one. And the
  gate is not the scope: where a verdict is relative to the rest of the set (superseded-by,
  already-in-`main`), newness gates and the full set stays the scope. (Portable — a promote
  candidate for `basics/scheduled-tasks.md`, which states the precondition contract but not this.)
- **You cannot force a due slot by running the scheduler workflow by hand.** Dueness is
  stateless — a slot is due iff its time falls in `(last successful run, now]` — so a
  `workflow_dispatch` run outside the slot's window succeeds, prints `- no tasks due`, and
  does nothing. It looks like a healthy run. To exercise a task Action-side, invoke its
  worker directly, or move the slot hour in `taskScheduler` and wait for the cron.
- **A scheduled task is gated twice — prove a change through `planRun`, never through its own
  precondition.** `planRun` computes the due list *before* any precondition runs, so a task whose
  most-recent slot has already been run is never evaluated and never reads its signals at all. #513's
  forced-run override landed with every test driving the precondition (or the signal collector) directly
  and was inert on exactly the run it existed for — the mid-day manual trigger — because the due-list
  gate it never touched had already dropped the task (`evaluations: []`; fixed in #516). A test that
  starts *inside* the gate proves only "works once evaluated" and says nothing about whether the task
  ever gets there. Drive the real `planRun` from a deliberately **non-due** slot: that is the only shape
  that catches it.
- **Every due task in a run shares ONE checkout — an agentless worker must not touch it.** The
  scheduler runs the whole due list in a single working tree, so a worker that checks out a branch or
  leaves an index behind hands the next task a tree it did not expect, and a run that dies leaves the
  mess for whatever follows. A task whose output is a regenerated file lands it through
  `engine/scheduler/deliver-generated.mjs` — git plumbing against the fetched base tip, with HEAD, the
  index and the working tree untouched — and reads its prior state from that base rather than local
  HEAD, so stacked runs stay idempotent. (`basics/baselining`'s own deliver is the deliberate
  exception: it commits a whole working tree and re-cuts a dated family branch; the landing itself —
  delivery preference, CI dispatch, arm/land/merge — is shared, in `engine/scheduler/land-pr.mjs`.)
- **A code-search hit is evidence; a code-search miss is not — survey by reading each file.**
- **Derive the test file list from the tree — every hand-written glob here under-runs the suite.**
  There is no `package.json` and no test script, so each session invents its own incantation and
  silently verifies less than it thinks. Measured in this checkout: `node --test <dir>` does not
  recurse — it resolves the path as a module and dies with `Cannot find module`; bash `**` is not
  recursive without `globstar`, so `engine-tests/**/*.test.mjs packs-tests/**/*.test.mjs` reaches
  **37 of 65** tracked test files. Four consecutive sessions (2026-07-26, #459/#452/#435/#468) each
  wrote a different command and reported 587, 690, 621 and 697 tests — three of them pushed after
  running a strict subset. Neither published list is authoritative either: `ci.yml`'s `tests=(…)`
  array omits `vendoring/*.test.mjs`, and `engine/checks/README.md`'s "as CI runs it" one-liner
  names `engine/test/`, `skills/` and `mount/`, none of which exist. So enumerate from git and let
  the count speak: `node --test $(git ls-files '*.test.mjs')`. (The drift-guard, once the array is
  clean: assert every tracked `*.test.mjs` is matched by `ci.yml`'s globs.)
- **A branch that waited overnight has lost its base *and* possibly its premise — re-verify the
  problem still exists on current `main`, unasked.** This repo merges its own scheduled-task PRs
  without a human, on top of multi-phase migrations that retire whole directories: measured on
  PR #465, `main` moved **14 commits in 13.7 hours** and one of them (#473, "retire `run_daily/`")
  *deleted the file the PR's diagnosis rested on* and had already landed most of its content. The
  branch rebased cleanly and the tests stayed green — the change was simply no longer the change to
  make, and the correct move was `git checkout -B <branch> origin/main` and re-applying only the
  surviving slice (9 files → 2). So syncing the base is not the check; the check is a **content**
  one: after `git fetch`, read what the new commits did to the surface you are changing and state
  whether the problem is still there, what the goal was, and what survives. Do this whenever you
  return to a paused branch, before presenting it — the owner should never have to ask "is this
  change still needed" (asked three times on #465 before it was volunteered).
- **Re-basing your edit onto a moved `main` means re-applying it, never restoring a whole-file copy.**
  A pack's `RULES.md` is append-only and several auto-merged runs write it a day, so a `cp` of the
  version you read back over the fetched one deletes their lessons — and nothing goes red, because no
  test or check reads prose (caught by luck on 2026-08-11/#758, 54 lines already staged). Re-read the
  fetched file, apply the same anchored edit to it, and confirm the stat shows insertions only.
- **Every `Claude_Code_Remote` call costs minutes, and a call that returns nothing has NOT failed —
  never re-issue it.** The whole server behaves this way, not one tool: measured over four sessions
  on 2026-07-29, `add_repo` ran 270–285s a call, `send_later` 117–390s, `list_triggers` 139–325s,
  `delete_trigger` 286–301s, `subscribe_pr_activity` 14–237s. They read like cheap registrations,
  so a session issues one, sits through minutes of silence, concludes it hung, and issues it again —
  and *the duplicate is the dominant cost*, because the first call had already succeeded:
  **#562 (`2026-07-29T1500Z`) — 6 `add_repo` calls, 1121s of that session's 1391s of tool
  wall-clock (81%)**, with `HelloWorldFlutterApp` added twice (285s + 271s); **#553
  (`2026-07-29T2206Z`) — the same PR check-in `send_later`d 4 times, 1107s of 2028s (55%)**; **#544
  (`2026-07-29T1248Z`) — `list_triggers` ×2, `delete_trigger` ×2 on one trigger id, `send_later` ×2:
  1854s of 2472s (75%)**, in a session whose real work was 166 tool calls. `AskUserQuestion` shares
  the shape — #559's session asked one question twice for 218s + 204s. So: **one call per intent,
  ever**, and when what you want is "is it green yet", read the check status directly and merge on
  the already-green result rather than buying a notification. Budget these calls before making them:
  four of them is most of an hour. And to *read* a public sibling repo, `add_repo` is not the route at
  all: it attaches nothing and answers that the session's git proxy already serves anonymous reads —
  measured 2026-08-11 (#641), 3m40s before the owner interrupted it plus 40s on the re-issue, against
  `git clone --depth 1 https://github.com/<owner>/<repo> /workspace/<owner>/<repo>` in ~2s.
- **Sync local `main` with `git reset --hard origin/main`, never `git pull` — this repo's session
  clones are shallow.** The post-merge sync step of `merge-to-main` is where it bites, and it bit
  five separate sessions on 2026-07-29 alone (#548, #551, #537, #559 and the session-end capture of
  `73a4db48`). A shallow clone has no common ancestor with the fetched remote, so `git pull` either
  demands an explicit strategy or reports the stale local ref as carrying unique commits it does not
  have — and the tempting reading, "local `main` has work the remote lacks", is wrong every time:
  the session's own work is already *in* `origin/main`, which is why it just merged. #537's session
  spent 87s across `git pull`, `git rev-parse --is-shallow-repository` and log comparisons proving
  that from scratch; #559's landed on "git sees no common ancestor" the same way. Nothing of value
  is ever on this repo's local `main`, so the sync is unconditional: `git fetch origin main && git
  reset --hard origin/main`. (Portable — a promote candidate for `git-github`'s merge procedure,
  where "your clone may be shallow" is true of any container-hosted session.)
- **The home has no `.claudinite/shared/` mount — machinery paths must accept both roots.** A
  consumer runs the vendored engine under `.claudinite/shared/engine/…` with packs under
  `.claudinite/(shared|local)/packs/…`; the home *is* the corpus and runs the same code from the
  repo root. So a path, regex, or workflow command written to the consumer mount shape works
  fleet-wide and fails on exactly this repo — the last place anyone exercises it, so the break
  surfaces late. Write the two-root form up front: make the `.claudinite/(shared|local)/` prefix
  optional in a pattern, and in a command probe for `.claudinite/shared/` first, falling back to
  the repo root.
- **Tightening a contract that member-owned files must satisfy has NO carrier — baseline
  migrations move paths, not schemas — so it lands as a fleet-wide silent break.** Vendoring
  refreshes `.claudinite/shared/` only; a member's `.claudinite/local/packs/<pack>/pack.mjs` is
  the member's own content, which no converge may edit. And `migrations/` cannot help: its record
  is a path relocation (`aliases: [{ canonical, legacy }]`, applied by `applyFileAliases`), so it
  has no way to express "the field `rules` is now `worldRules`/`workRules`" or "`ruleRoutingGuidance`
  is now required" — exactly what #555 tightened, shipping no record because there was none to
  ship. The break is worse than loud: `normalizeManifest` returns `{ ...mod, rules }` with `rules`
  rebuilt **only** from the two scoped keys, so a legacy manifest's array is overwritten with `[]`
  and **that pack's checks simply stop running** — no error, the pack still loads. Measured on
  2026-07-30: **eleven local packs across ten of the thirteen members** had to be rewritten by
  hand in one session, and the members' own pack tests asserted `pack.rules` and went red on CI
  the moment the manifests moved. So before tightening anything a member's own file must satisfy,
  ask what carries it across the fleet; if the answer is "nothing", the change is not ready —
  accept the legacy shape in `normalizeManifest` (and say so) until a carrier exists, and never
  let a stale declaration degrade to *fewer checks running* rather than a failure.
- **A stub is copied once and never re-copied — extend its contract through an *optional* key, and let
  the declaration itself trigger the staleness check.** Vendoring refreshes `.claudinite/shared/`, but
  `packs/*/stubs/` are artifacts a member copied into its own `.github/` and no converge ever touches
  again — so a stub that learns to read a new config key is invisible to every repo still holding the
  old copy: the config names the key, the copied action ignores it, the run goes green, and the feature
  is silently dead in production. `build_vars` (#729) is the shape to copy. The key is **optional**, so
  no existing config is invalidated and no member has to be migrated to stay valid. A
  **declared-but-unset** value fails the run rather than exporting `""`, which would reproduce the same
  silent death one level down. And `release-workflows` flags exactly the combination that reads the key
  and ignores it — a config declaring it against an action or workflow copy predating the exporter — so
  the repos that opted in are told to re-copy and nobody else sees a finding. That pairing is the
  carrier the entry above asks for: an opt-in contract can ship without one only because declaring it
  is itself the signal a check can see.
- **A migration record is always the newest code; the engine that executes its result is the
  member's, and only as new as its last successful converge.** `engine/migrations/apply.mjs` runs from a
  **fresh canon clone**, so every member gets today's record — but the worker that then commits and
  pushes it is the member's own **vendored** `.claudinite/shared/packs/basics/tasks/update/worker.mjs`,
  frozen at whatever converge last succeeded. So a record that needs a *new engine capability* to be
  deliverable is a **deadlock** on any member that hasn't got it yet: the record fires, the converge
  fails, the mount never advances — and the engine fix that would make the record deliverable can
  never arrive, because the only thing that could carry it is the converge the record is breaking.
  Measured 2026-08-05: `sheepdog-fleet-baseline` materialized `.github/workflows/fleet-baseline.yml`,
  which the Action's `GITHUB_TOKEN` may not push, and wedged `missingbulb/Sheepdog`'s every converge
  **twice** — the second time *after* the engine fix (#651) had merged to canon, because Sheepdog was
  still running the pre-fix worker. So when a record depends on engine behaviour newer than the record's
  own landing date, make `appliesTo` **probe the member's own mount** for that capability and stay
  inert until it reads back — self-healing in two cycles, no manual step on any member (#652). Probe by
  content, not by version: the baselining stamp covers the whole mount and says nothing about *which*
  engine change is in it. And fail **safe** — an unreadable or missing mount file must read as "not
  capable", which only ever delays that one record instead of wedging the repo.
- **When the owner asks why something failed, lead with the throwing call site — `file:line`, the
  function, and which side enforced it.** He is asking for the mechanism, not the sequence; an answer
  that narrates the flow correctly but never names the line reads as unanswered, and he will ask again.
  Measured 2026-08-05 (#649): "explain why the flow failed" → a correct stage-by-stage narrative →
  *"You didn't explain my question from before. What exactly threw the error?"* → `worker.mjs:429`,
  `execFileSync` on `git push`, refused **remote-side** on receipt → understood immediately. Three
  rounds and ~10 minutes for one fact that fits on one line. The local/remote half matters as much as
  the line: it is what says why nothing local — the commit, `engine/migrations/apply.mjs`, the suite,
  the sweep — saw it coming.
- **This repo's fleet machinery reports success from reaching the end of the code path, not from
  the artifact — check the response, and alarm on the stamp.** the delivery in
  `packs/basics/tasks/update/worker.mjs` destructured only `json` from the PR-open POST and
  never read `status`, so a 403 (the member's *"Allow GitHub Actions to create and approve pull
  requests"* setting, invisible from inside the Action) put the error body in `pr`, left
  `pr.node_id` undefined, skipped the auto-merge arm silently — and the run still logged
  `preprocessing basics/baselining: ok`. It compounds because `openMaintenancePull` reuses by open
  **PR**, not by branch: a cycle that pushes a branch but fails to open its PR finds nothing to
  reuse and mints a fresh one nightly. Measured 2026-07-29/30: **eleven of twelve consumers frozen
  on the 2026-07-28 canon ref, 27 orphan `claudinite/maintenance-*` branches, several repos
  carrying two for one day** — and every nightly run green throughout. Nothing detected it; the
  owner did, by feel ("I feel the situation is bad"). Two habits follow. Read the status of every
  API write whose result you then branch on — a body-only destructure turns a refusal into a
  plausible object. And judge the fleet by **members' stamps**, never by scheduler run
  conclusions: the stamp is the only artifact that moves when baselining actually worked, which is
  why a stamp-staleness alarm (#331) is the missing guard and not a nice-to-have.
- **A fleet task's target list is enumerated dynamically; the routine's reachable-repo grant is
  hand-typed UI config — they drift, and the drift completes rather than fails.** The precondition
  builds its member list over `FLEET_GITHUB_TOKEN` (`engine/scheduler/signals/fleet.mjs`, "the one
  token that can enumerate every repo the owner owns"), while the executor routine's MCP repo scope
  is set by hand in a UI no Action can read — so every member adopted from here on is enumerated by
  the precondition and invisible to the executor until someone widens the grant, and the gap only
  ever widens. Measured 2026-07-31 on #602: the dispatch named 12 members, the session's grant
  listed 10, and `growth-promote` reads members **over the API, never a checkout** — so the run
  would have noted two denials, proceeded, and filed a PR reading as a complete 12-member sweep.
  That is the worse of the two failure shapes: a routing mismatch stalls visibly (nothing happens,
  forever, and you notice), an unreachable target *succeeds wrongly*. So a fleet task must **fail
  loudly on a Context target it cannot reach** rather than proceed on a partial list, and adopting a
  member is not done until the routine's repo scope names it. No check can catch either half — this
  is routine config, not repo content.
- **`packs/README.md`'s check tally conflicts on every concurrent check-adding PR — recompute it,
  never take a side.** The hand-maintained "Hardcoded conformance checks" count is a repo-wide
  aggregate that each PR adding a rule must bump, so two such PRs in flight always collide there,
  and a branch that sat overnight collides with whatever landed meanwhile. Both sides of the
  conflict are stale the moment a third PR merges, so picking one — or incrementing the higher —
  is guessing; `packs-tests/catalog-tally.test.mjs` then goes red and the loop repeats. Derive it
  instead: discover the packs and count the active rules (`discoverPacks` +
  `run-active-pack-rules.mjs`), write that number, re-run the tally test. Measured 2026-07-31: the
  same tally was resolved three times in one day across two sessions (67→68 in #600, then 68→69→70
  twice inside #593's merge sequence).
  The nastier half of the same tally: a PR that **forgets** the aggregate doesn't conflict at all.
  #607 bumped its pack's own row in the catalog table — the *other* hand-maintained number a new
  rule must update — and never touched the corpus tally, so it merged clean on a suite that had run
  **once**, 12.5 hours earlier against a base that predated #606's own check, and left `main` red
  for every PR after it until #608 corrected 68 → 69 as an aside. A conflict at least stops you;
  the omission is silent, because a whole-tree aggregate is judged against the merged result and
  no branch's CI ever sees that. So a green from before `main` moved is not evidence about
  post-merge `main`: re-run the suite against current `main` immediately before merging a
  rule-adding PR, and update **both** numbers. (Portable — a promote candidate for `git-github`'s
  `merge-to-main`, which today says nothing about merging on a stale green.)
- **A worker whose cwd sits inside the tree it deletes takes every child with it — and the death
  arrives dressed as a legitimate outcome.** The converging task's prework runs with its cwd
  *inside the mount* (`.claudinite/shared/packs/basics/tasks/update/`), and the converge `rmSync`s that
  whole tree before re-copying it. On Linux the worker survives on the unlinked inode and so does
  every child it spawns — so `check_the_world` died at `process.cwd()` with `ENOENT … uv_cwd`
  **before running a single check**, on every night that actually converged. Nothing looked wrong,
  because `escalation()` folded the crash into `checks-could-not-run` (worker.mjs:184) — a real code
  that reads as "this mount is too old to have checks". Net effect, fleet-wide and invisible: the
  conformance gate had never gated a converged tree, and every converging night burned an agent
  escalation on it. Caught live on a Sheepdog run, by nobody's test (#689/#691). Two habits. **Give
  every spawned child an explicit `cwd`** — `node([…], env, { cwd: root })` — rather than letting it
  inherit a directory its parent is about to delete, and resolve a root that cannot vanish underneath
  you (`--root`, then `CLAUDE_PROJECT_DIR`, then `cwd`: the order `check_the_world` and
  `engine/selftest.mjs` now share; the disagreement between them is the only reason selftest survived
  the same dead cwd untouched). And **when a crash and a benign state share one outcome code, the
  crash is unobservable** — keep "could not run" distinguishable from "had nothing to run".
- **When a member's maintenance PR won't land, read the member before theorizing — `unstable` beside
  a green sweep is a *parked* run, not a missing repo setting.** GitHub gates `pull_request` runs on
  Actions-pushed branches at `action_required`; a parked run never reports, so the PR reads
  `mergeable_state: unstable` and `enablePullRequestAutoMerge` refuses it. Measured 2026-08-07 (#676):
  a session read that signature as the members lacking *"Allow GitHub Actions to create and approve
  pull requests"* and offered to have the owner flip it across the fleet. The owner's *"Check that
  setting. I think you're wrong."* was right, and the two reads that settled it took under a minute —
  each member's raw `.claudinite-checks.json` (all eight already said `delivery: auto-merge`) and the
  head sha's `pull_request` runs (4 of the last 5 parked `action_required`). The tree already knew:
  `baselining/worker.mjs` documents both shapes and the session quoted the wrong one — but this is a
  mistake of omission you make *without* opening that file, which is why it belongs here rather than
  beside the code. So propose a platform-settings change only as a **conclusion**, never as a
  diagnosis, and never on a symptom two API reads resolve. (Sibling of the standing ruling above that
  what Claudinite ships must run on the settings a member already has — that one is about what to
  *build*, this one about what to *believe*.)
- **A canon pack's directory name is kebab-case — lowercase words joined by single hyphens.** The
  directory name is the pack's public id: members spell it in `.claudinite-checks.json`, a migration's
  `declarePacks` op seeds it, the catalog row and every cross-reference repeat it — so a name in another
  casing is renamed later across all of them. Every pack under `packs/` follows it; `grow_with_claudinite`
  is the single grandfathered exception (it predates the convention and sits in every member's
  declaration, so renaming it would be a fleet migration, not a tidy-up). Nothing stated this until now,
  which is how `UserPreferencesStore` shipped in #567 and cost a whole-pack rename to
  `claude-code-web-users-support` after the owner asked for *"the appropriate casing for pack names"*.
  Name from the **surface** the pack serves, not the first feature you are building for it — that same
  rename widened the pack from one store to every Claude-Code-web capability. (Convertible: a check over
  `packs/*/pack.mjs` directory names would carry this whole rule, and the fixture is trivial — but any
  new rule moves `packs/README.md`'s check tally, which a growth-extract run may not touch. Left for the
  weekly prose-to-checks sweep's reviewed PR.)
- **"No X should decide this" is a question about whether the decision exists at all — never answer it
  by relocating the knob one rung out.** Measured 2026-08-09 (#707): asked to retire the task-level
  `session_scope` because *"tasks on Sheepdog have the access to the fleet and they know what they
  do"*, the session moved the same choice up to the pack manifest as `sessionScope: 'fleet'` — a new
  manifest-vocabulary entry, a resolver module, `discover.mjs` wiring, a rehearsal fixture and tests,
  all authored, pushed and then deleted one round later on *"Why do you think you need `sessionScope:
  'fleet'`? Who does this help?"*. The reach was already implied by **which repo runs the task** — the
  sheepdog enforcer *is* the fleet — so the field only ever protected one structural holdout (the
  canon's own curation tasks, whose ordinary executor does not hold the fleet), which is an exception
  at that caller, not a knob for everyone. So when a declaration is questioned, first ask **who would
  ever set it differently, and why they could not be read off the structure**; a single structural
  answer means delete the field and document the exception where it lives. Cousin of the standing "a
  pack default stays in the pack — don't ask it at adoption" ruling above: both are about refusing to
  materialize a decision nobody actually has to make.
- **The home is the last repo to receive its own stub changes — nothing delivers to it.** Every member
  gets `engine/scheduler/stubs/claudinite-scheduler.yml` written into `.github/workflows/` by its nightly
  converge; the canon has no mount and no converge, so its own copy is hand-maintained and drifts from the
  stub it ships. That drift is invisible until it is a permission denial in production: the canon's
  workflow sat on `actions: read` while the stub had carried `write` since store-release, so the CI
  dispatch POST 403'd and **only** the canon's own fold PR stranded — for ten days (#535, fixed in #704).
  Paired tests over the two files are not the safety net you think: one already asserted the
  `overrides` input on both and said nothing about `permissions`, so the drift walked straight past it.
  So when a change touches the vendored stub, edit the canon's `.github/workflows/` copy in the **same
  commit** and diff the two whole files, never just the lines you came for.
- **Never combine PRs by pushing one's branch onto the other's base — update the PR you're keeping,
  close the other** (owner decision, 2026-08-11). GitHub marks a PR merged the moment its head is
  reachable from its base, so the push merges it under your name and shows it merged into a branch
  that is itself an open PR's head. A later `state: closed` is a no-op — check the API's `merged`
  field before reporting (#754).
- **One approved change is one PR.** A dispatch prompt's designated branch routes work, not review:
  work that completes or corrects an open PR belongs on that PR's branch. Splitting it gives the owner
  two gates for one decision and invites approving half — #739's new pack was approvable while
  `basics` still held a rule the pack owned.
- **A held stamp reads as stale if you judge a member by `claudinite.updated` alone — read `ref`
  too.** `heldStamp()` pins a repo's `updated` to the day before its earliest pending agentic note
  (#330), so a mount converging normally every night can still show a week-old `updated` for as
  long as that note stays unapplied — which is the mechanism working, not a sign of a dead repo.
  Misread live 2026-08-12 (#768): a session called ClaudiniteCanary and GoogleCalendarEventCreator
  stale on `updated` alone, when both were converging hourly and simply carried a pending
  `prework-rename` note — the tell was in the same object all along, a bare-midnight `updated`
  beside a `ref` naming a canon commit from the day before. Any freshness claim about a member must
  read `ref` (or, once a repo is served by the versioned-updates flow, its `engineVersion` /
  `packVersions` — #786 tracks the sweep that still doesn't) rather than `updated` in isolation: a
  held stamp looks most stale exactly when the repo most needs someone to look at it.
- **`updates/*` is a live cross-version API — empty an export, never remove one; and the canary
  rehearsal structurally cannot catch you.** A member runs its own **vendored** update worker, frozen
  at its last successful converge, but the flow modules that worker `load()`s come from a **fresh canon
  clone** — so within a single call the callee is instantly current and the caller is instantly stale,
  with no version gate between them. Deleting an export therefore does not deprecate it; it breaks
  every worker already in the field on its **next** run. Measured 2026-08-13 (#802, on #797's path):
  `applyStageBrief` was dropped from `updates/terminals.mjs` while every member's apply-stage path
  still called it, so the call threw *after* the update PR was opened — the update never completed,
  the mount never refreshed, and the member therefore never received the worker that would stop
  calling it. A permanent fleet-wide wedge on the first cycle. **The canary rehearsal cannot see this
  class**: by design it drives the worker *this ref ships*, so it exercises the new caller and never
  the fielded one — right for testing a worker change, and exactly why a flow-side removal is
  invisible to it. So keep the export **callable** until no fielded worker calls it (one full cycle
  after members vendor a worker that doesn't), let it return something nothing reads, say at its
  definition that it exists to be callable rather than useful, and pin the flow surface fielded
  workers call with a test — that test is the only gate that sees this. **Give the shim an expiry in
  that same test when you add it** (an engine version by which someone must re-check), because the
  removal has no other trigger: nothing in canon ever fails to remind you. **And retire it by reading
  the field, never by reasoning about it** — "canon's worker stopped calling it" is not the condition,
  "no member's *vendored* worker calls it" is, and only the members' repos answer that (2026-08-14, all
  14 read: the shim came out at engine 3, ahead of its engine-5 expiry). Same skew as the
  migration-record entry above, in the other direction: that one is a record needing engine capability
  a member lacks, this one is canon withdrawing something members still call.
- **A declarative check spec carries no comments — name its keys so the declaration reads alone**
  (owner correction, 2026-08-13, #789/#799). `patternRule(spec)` exists so a pattern-shaped rule is
  **data**, and the point is lost the moment the data needs prose beside it to be understood: *"no
  comments on the check! make the check declaration itself be readable (pattern+error message is a
  lot)"*, then, on the follow-up append, *"use more words to describe what a thing is: 'correspond'
  isn't informational if you didn't read the design doc. Neither is 'files' or 'line'. Prefer
  `scanFiles` and `matchLines`."* The reader to write for is someone opening one converted check cold,
  with the engine's design doc unread — so a spec key spells the full noun phrase for what it holds
  (`scanFiles`, `matchLines`, `relevantWhen`, `unlessLineMatches`), never a short word that only means
  something to whoever built the vocabulary; #800 renames all of it and every converted declaration
  accordingly. The same test governs any key added to the vocabulary later: **if it needs a comment to
  be read, it needs a better name.** (Convertible in principle — a scan for comment lines inside a
  `patternRule({…})` literal — but a new rule moves `packs/README.md`'s check tally, which a
  growth-extract run may not touch; left for the weekly prose-to-checks sweep, as with the kebab-case
  entry above.)
