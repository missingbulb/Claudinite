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

## Canon-specific gotchas

- **Baselining backfill skips the home — hand-declare fleet-seeded packs here.** The nightly
  baselining that lands a `seededByDefault` pack (and canon-delivered declaration changes) on
  every member is gated `!isHome`, so the canon home is the one repo it never reaches: a newly
  seeded pack does *not* arrive here automatically — the home's own `.claudinite-checks.json`
  must be updated by hand in the same change that flips the seed. The natural drift-guard (a
  future check, once the home is clean) is: the home declares every `seededByDefault` non-local
  pack.
- **The home doesn't declare `git-github`, so its skills never mount — never conclude "no such
  skill" from `.claude/skills/`.** `mount-skills.mjs` filters on the *literal* declaration
  (`isActive(p, { packs: declared })`), not the `requires` closure `check_the_world.mjs` resolves,
  and the baselining that would normalize that closure into `.claudinite-checks.json` is the one
  thing gated `!isHome` — so `merge-to-main` and `git-github-advanced` are simply absent here.
  Read `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree — the corpus *is* this repo,
  and an unmounted skill says nothing about whether its procedure applies. The seed-based
  drift-guard above would not catch this (`git-github` arrives by closure, never
  `seededByDefault`); a real one compares `resolveDeclaredPacks` against the literal declaration.
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
- **You cannot force a due slot by running the scheduler workflow by hand.** Dueness is
  stateless — a slot is due iff its time falls in `(last successful run, now]` — so a
  `workflow_dispatch` run outside the slot's window succeeds, prints `- no tasks due`, and
  does nothing. It looks like a healthy run. To exercise a task Action-side, invoke its
  worker directly, or move the slot hour in `taskScheduler` and wait for the cron.
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
- **The home has no `.claudinite/shared/` mount — machinery paths must accept both roots.** A
  consumer runs the vendored engine under `.claudinite/shared/engine/…` with packs under
  `.claudinite/(shared|local)/packs/…`; the home *is* the corpus and runs the same code from the
  repo root. So a path, regex, or workflow command written to the consumer mount shape works
  fleet-wide and fails on exactly this repo — the last place anyone exercises it, so the break
  surfaces late. Write the two-root form up front: make the `.claudinite/(shared|local)/` prefix
  optional in a pattern, and in a command probe for `.claudinite/shared/` first, falling back to
  the repo root.
