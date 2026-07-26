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
- **A one-word merge approval still means run `merge-to-main` end to end — otherwise the
  conversation capture never happens.** On "lgtm" / "merge to main" the tempting move is the
  single `mcp__github__merge_pull_request` call, and the PR does land — but the skill's *last*
  step, `node packs/grow_with_claudinite/capture-log.mjs --issue <n>`, is then silently skipped,
  and that step is the only thing that feeds the whole conversation lifecycle. A dropped capture
  is invisible: no error, no check, and the session ends. This bit two consecutive canon sessions
  (2026-07-23, 2026-07-24), each needing two owner prompts ("did you record this conversation to
  log?", then "there's a tool, in the merge to main skill") to recover it — the second session
  even answered "there was no such step" before finding it. So: a terse approval is an
  instruction to run the whole skill, not just its merge call. It stays prose rather than a check
  because the conversation surface a work rule sees (`engine/checks/helpers/work.mjs`) exposes
  only owner turns — detecting "a merge happened but capture didn't" needs the transcript's tool
  calls, which only a shared-canon helper change could expose.
- **Canon sessions usually have a consumer repo mounted too — pick the merge skill by the repo
  being merged.** Work on the canon is routinely done in a session that also has a consumer
  checkout (GCEC, most often), and consumers carry their *own* merge skill. Told to consult "the
  merge to main skill" right after merging a **Claudinite** PR, the 2026-07-24 session loaded
  GCEC's `merge-and-ci` — the nearest-named merge skill in the session, from the wrong repo — and
  correctly reported it has no capture step, because that step is canon's. Consumer merge skills
  are not substitutes for `packs/git-github/skills/merge-to-main/SKILL.md`; resolve a skill
  against the repo whose PR you just merged.
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
