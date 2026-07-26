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
- **The home's mounted skill set is short a whole pack — never conclude "no such skill" from
  `.claude/skills/`; read the pack tree.** Universal packs reached only through another pack's
  `requires` (today `git-github`, which `basics` requires and which is deliberately never
  `seededByDefault`) arrive in a consumer's declaration because baselining normalizes the
  `requires` closure into `.claudinite-checks.json` — and baselining is the one thing that skips
  the home (see the gotcha above). `mount-skills.mjs` filters on the **literal** declaration
  (`isActive(p, { packs: declared })`) rather than `resolveDeclaredPacks`, the way
  `check_the_world.mjs` does, so in this repo `git-github`'s bundled skills — `merge-to-main`,
  `git-github-advanced` — are simply absent from `.claude/skills/`. This has already cost real
  round-trips: three consecutive #394 sessions (`2026-07-23T0936Z`, `2026-07-23T1637Z`,
  `2026-07-24T0508Z`) reached for the merge skill, found nothing mounted ("the `merge-to-main`
  skill isn't mounted here"), hand-drove the merge from `mcp__github__merge_pull_request` alone —
  and so silently dropped the skill's post-merge step, the `capture-log.mjs` conversation capture.
  Every one of those three captures happened only because the owner asked for it, 5 / 58 / 5
  minutes after the merge, across five owner turns that should not have existed. So: **when a
  procedure ought to have a skill and `.claude/skills/` doesn't show it, read
  `packs/<pack>/skills/<name>/SKILL.md` straight out of the tracked tree** — the corpus is this
  repo, the doc is always there, and an unmounted skill says nothing about whether the procedure
  applies. The drift-guard the existing gotcha proposes ("the home declares every
  `seededByDefault` non-local pack") would **not** catch this one — `git-github` is reached by
  closure, not by seed — so a real guard has to compare `resolveDeclaredPacks` against the literal
  declaration, or `mount-skills.mjs` has to resolve the closure like the world runner already does.

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
