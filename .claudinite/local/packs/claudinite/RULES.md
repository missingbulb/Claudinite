# Claudinite — the canon's own non-portable working rules

This is the Claudinite home repo's own local pack: the capture surface for lessons that are
**specific to working on the canon itself** and would not make sense mounted into a consuming
project. Portable lessons — anything true for repos beyond this one — belong in the shared canon
under `packs/`/`skills/` instead (proposed by PR, or lifted by the promote stage).

The growth lifecycle writes here automatically: the `growth-extract` and `conversation-extract`
daily tasks route the canon's own non-portable lessons into this pack (each at the local
promotion ladder's strongest mechanism — a check where the rule is deterministic, otherwise terse
prose below). Entries accrete as sessions on the canon surface durable, canon-specific friction.

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

## Canon-specific gotchas

- **Baselining backfill skips the home — hand-declare fleet-seeded packs here.** The nightly
  baselining that lands a `seededByDefault` pack (and canon-delivered declaration changes) on
  every member is gated `!isHome`, so the canon home is the one repo it never reaches: a newly
  seeded pack does *not* arrive here automatically — the home's own `.claudinite-checks.json`
  must be updated by hand in the same change that flips the seed. This has already bitten silently
  once — `grow_with_claudinite` was `seededByDefault` but predated the home's hand-curated
  declaration, so the canon's own sessions sat outside the conversation lifecycle until #356
  declared it. The natural drift-guard (a future check, once the home is clean) is: the home
  declares every `seededByDefault` non-local pack. (At the time of writing `tidy-repo` is
  `seededByDefault` yet absent from the home's declaration — the same gap, unverified.)
- **A canon session with a consumer repo also in its sources will reach for the *consumer's*
  merge skill — merge by the skill of the repo you are merging into.** Canon work is routinely
  dual-repo (the canon plus the fleet member being piloted; #394's rollout ran that way for days),
  and both repos ship a merge skill under different names — the canon's
  `packs/git-github/skills/merge-to-main/` and, say, GCEC's local `merge-and-ci`. The consumer's
  skill wins the match on name/description and is followed to the letter, so the canon-only steps
  in *its* recipe are silently skipped. Concretely and repeatedly: the **post-merge conversation
  capture** (`node packs/grow_with_claudinite/capture-log.mjs --issue <n>`, the "After the merge"
  section of `merge-to-main`) was missed after a merge to canon `main` in **three consecutive
  sessions** (2026-07-23 ×2, 2026-07-24), each time costing the owner two prompts to recover
  ("did you record this conversation to log?" → "there's a skill for that"), and each miss is a
  conversation the growth lifecycle would have lost outright had the owner not caught it. So:
  before merging in a dual-repo session, resolve the merge skill **by target repo**, not by which
  skill matched first — and treat capture as part of the merge, not as an optional epilogue.
- **Never re-serialize a repo's JSON config to apply an edit — patch the text.** A serializer
  round-trip silently rewrites everything it wasn't asked to: Python's `json.dump`/`dumps` defaults
  to `ensure_ascii=True`, so every non-ASCII character becomes a `\uXXXX` escape (an em dash in a
  config string becomes its six-character `\u2014` escape), and indentation, key order and the
  trailing newline become the
  serializer's opinion rather than the file's. Nothing fails and the tests stay green, so the damage
  rides onward in every commit that copies the file. This already landed in the merged mains of four
  member repos during the phase-2 fleet flip (2026-07-21, #385) — TLDR, LaughCounter,
  GoogleCalendarEventCreator, ShoutsAndWhispers — and was caught only because the owner happened to
  read one line of a diff. Edit the JSON as anchored text; if you must round-trip, pin every lossy
  default (`ensure_ascii=False`, the file's own indent, restore the trailing newline) and read the
  resulting diff before committing. The engine's own writers are already lossless
  (`JSON.stringify(…, null, 2)`) — the hazard is the ad-hoc Python patcher reached for mid-sweep.
  (Portable — a promote candidate for the `repo-text-sweeps` skill, where a `\uXXXX`-in-tracked-JSON
  check would carry it deterministically.)
- **Test git fixtures must commit with signing off.** `engine-tests/helpers.mjs`'s `makeRepo`
  overrides only author/committer identity, so a fixture commit still goes through the signing
  service — and every `makeRepo` call site (31 of them) pays for it. When signing degrades, the
  whole suite degrades with it: each fixture commit blocks on the service, and the suite leaks
  descriptors until `git commit` and `git push` fail process-wide. This already cost a 31-minute
  outage in one session (2026-07-23, #394): commits started failing, then `git push` died with
  `too many open files`, measured at ~800 leaked FDs per full-suite run against a 4096 cap — about
  four runs to re-trigger. The next session visibly rationed its own verification because of it
  ("FD is climbing (3303/4096), so I'll avoid more full runs") — a leak that caps how much the
  suite gets run is worse than a slow suite. Commit fixtures with
  `git -c commit.gpgsign=false commit --no-gpg-sign`: signing a tmpdir throwaway buys nothing.
  (Portable beyond the canon — a promote candidate for the `writing-tests` skill.)
- **The canon home must declare `git-github`.** Skills mount only from *declared* packs
  (`engine/pack_loader/mount-skills.mjs` unions over the active packs), and `git-github` is absent
  from the home's `.claudinite-checks.json`. Its `merge-to-main` skill is what owns the post-merge
  conversation capture (`capture-log.mjs --issue <n>`), so undeclared, the canon's own sessions
  merge without capturing and the growth lifecycle silently loses its input — the one merge step
  with no visible artifact when skipped. This bit twice in one day (2026-07-23, #394): the owner
  had to prompt for the capture both times, and in the second session the agent first answered
  that no such mechanism existed before rediscovering the skill. Note this is a *different* gap
  from the baselining-backfill bullet above: that one reaches only `seededByDefault` packs
  (`basics`, `grow_with_claudinite`, `tidy-repo`), and `git-github` is not among them.
- **Fail-soft SessionStart steps hide their own breakage fleet-wide — test the emitted
  output, not the exit code.** Every `engine/pack_loader/` SessionStart step
  (`inject-pack-prose.mjs`, `mount-skills.mjs`, `env-requirements.mjs`) wraps its body in
  `try { ... } catch {}` so a broken loader never blocks a session. That fail-soft is deliberate,
  but it means a runtime fault — a wrong dynamic-import target, a renamed module — exits 0 and
  simply emits nothing: no error, no signal. And because the engine is vendored verbatim into
  every member, one canon regression silently disables that step across the whole fleet at once.
  This already bit once (#395): `inject-pack-prose.mjs` imported `registry.mjs` instead of
  `pack-registry.mjs`, so no active pack's RULES.md was injected into *any* session until a test
  caught it. So a step like this must be guarded by a regression test that runs the real script
  against a real corpus and asserts the **positive** effect — prose IS emitted — never merely
  that `status === 0` (which fail-soft makes meaningless); see
  `engine-tests/pack_loader/inject-pack-prose.test.mjs`.
- **The nightly self-refresh cannot repair the vendor-set computation — pin operational
  files against the REAL canon tree.** Baselining's converge re-runs
  `vendoring/compute-vendor-set.mjs` from canon HEAD, so a bug *in that computation* is
  the one class of canon regression that is not self-healing: every refresh faithfully
  reproduces it, and recovery is an out-of-band vendor refresh applied to each member by
  hand. This bit once (#413): the blanket "engine `*.md` is canon-maintainer reference"
  exclusion swept up `engine/scheduler/executor.md` — the executor routine's operating
  instructions, which a consumer's executor reads from its own mount — so every cut-over
  member's executor booted with no instructions and drained nothing (GCEC filed six
  `ready-for-agent` dispatches and ran none), and baselining could not fix it. So when the
  vendor set excludes by *pattern*, an operational file that matches needs a by-path
  whitelist (`VENDORED_ENGINE_DOCS`) **and** a regression test asserting against the real
  canon tree, not only a synthetic fixture: a fixture keeps proving the whitelist mechanism
  works while the live path silently drops out from under it (see the paired tests in
  `vendoring/compute-vendor-set.test.mjs`).
- **You cannot force a due slot by running the scheduler workflow by hand.** Dueness is
  stateless — a slot is due iff its time falls in `(last successful run, now]` — so a
  `workflow_dispatch` run outside the slot's window succeeds, prints `- no tasks due`, and
  does nothing. It looks like a healthy run, which is why it costs a debugging session
  every time (it stalled the GCEC E4 pilot). To exercise a task Action-side, invoke its
  worker directly, or move the slot hour in `taskScheduler` and wait for the cron.
