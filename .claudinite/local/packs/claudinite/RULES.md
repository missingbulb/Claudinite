# Claudinite — the canon's own non-portable working rules

This is the Claudinite home repo's own local pack: the capture surface for lessons that are
**specific to working on the canon itself** and would not make sense mounted into a consuming
project. Portable lessons — anything true for repos beyond this one — belong in the shared canon
under `packs/`/`skills/` instead (proposed by PR, or lifted by the promote stage).

The growth lifecycle writes here automatically: the `growth-extract` and `conversation-extract`
daily tasks route the canon's own non-portable lessons into this pack (each at the local
promotion ladder's strongest mechanism — a check where the rule is deterministic, otherwise terse
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
  initiative's tracking issue (agent-preprocessing → #394); a phased plan lives in the sibling
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
  `.claudinite-checks.json` entry — exactly where `fleet-census` and `fleet-freshness` already keep
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
  conversation-extract prune is skipped rather than failing).

## Canon-specific gotchas

- **Baselining backfill skips the home.** The nightly baselining that lands a `seededByDefault`
  pack (and canon-delivered declaration changes) on every member is gated `!isHome`, so the canon
  home is the one repo it never reaches: what the fleet receives automatically, this repo's own
  `.claudinite-checks.json` only ever gets by hand.
- **The home doesn't declare `git-github`, so its skills never mount — never conclude "no such
  skill" from `.claude/skills/`.** `mount-skills.mjs` filters on the *literal* declaration
  (`isActive(p, { packs: declared })`), not the `requires` closure `check_the_world.mjs` resolves,
  and the baselining that would normalize that closure into `.claudinite-checks.json` is the one
  thing gated `!isHome` — so `merge-to-main` and `git-github-advanced` are simply absent here.
  Read `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree — the corpus *is* this repo,
  and an unmounted skill says nothing about whether its procedure applies. The seeding gap above
  is a different one (`git-github` arrives by closure, never `seededByDefault`); catching this
  one needs `resolveDeclaredPacks` compared against the literal declaration.
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
  exception: it commits a whole working tree under the member's delivery preference.)
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
  four of them is most of an hour.
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
