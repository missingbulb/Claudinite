# canon-curation

The canon's own curation duties — the fleet-facing work only the **Claudinite home repo** runs:
promoting members' lessons into the shared canon, sweeping the corpus's prose backlog into
checks, and policing the corpus's `packs/` tree. A **local pack** of the canon home
(`.claudinite/local_packs/`, by owner decision 2026-07-19: Claudinite-maintaining-Claudinite is
project-specific content, so it lives on the home's own capture surface, not in the portable
canon): `detect: null`, never seeded by `--init` or any migration, declared by hand in exactly one
repo — the canon home itself, as `local_packs/canon-curation`. Its `run_daily` tasks ride the
fleet's default local-pack scheduling like any member's local tasks.

**Declaration cardinality is the mechanism.** A pack's `run_daily` tasks run once per *declaring*
repo, so a pack only the home repo declares yields exactly one unit per task per night — "central,
once" with no bespoke orchestrator step. Each gate double-locks that with the planner's `isHome`
signal, so a stray declaration elsewhere can't double-run the canon's work. Un-declaring the pack
freezes canon absorption without touching the members' side ([grow_with_claudinite](../../../packs-tests/grow_with_claudinite/README.md)).

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-promote-to-claudinite` | a participating member changed in the window (weekly full: all participants) | a PR against Claudinite's `main` |
| `prose-to-checks-sweep` | the home repo's weekly full sweep | a PR against Claudinite's `main` |

| Rule (≤5 words) | How enforced |
|---|---|
| Pack prose: no enforcement narration | check `pack-no-enforcement-narration` |
| Packs import only own + engine | contributed barrier `pack-independence` ([pack-independence.mjs](pack-independence.mjs) — pure data; the [barriers pack](../../../packs-tests/barriers/README.md) builds the rule) |

- **[promote.md](promote.md)** — the growth lifecycle's central stage: read the changed members'
  local packs, **generalize** the portable lessons, route each to the right canon home, and open a
  PR for the owner to approve. When a portable lesson's technology has no pack home, it mints a
  fingerprinted **stub pack** (in its own dedicated PR). This is the sole judgment gate before
  shared canon.
- **[item-routing.md](item-routing.md)** — the shared worthiness + routing method promote (and any
  other caller — the prose-to-checks sweep, an owner-requested retrospective pass) defers to, so
  every decision about admitting and placing an item is made the same way.
- **[promote-scope.mjs](promote-scope.mjs)** — the CI write-surface gate on promote's PRs: promote
  may write only under `packs/` and `skills/` (keyed on the `growth-promote` branch prefix).
- **prose-to-checks sweep** — the weekly backlog pass (worker: [the prose-to-checks
  skill](../../../skills/prose-to-checks/SKILL.md), which this pack owns and mounts at home): mine the
  corpus's **existing** prose for always-testable rules the conversion missed and convert the
  strongest ones. Promote descends the ladder for each *new* lesson; this works the *backlog*, so
  the corpus keeps shedding context over time.

## The growth lifecycle — three independent stages, no barriers

How a lesson is learned in a consuming project, lifted into the shared canon when it's portable,
and pruned back out of the project once the canon owns it. Two packs split it by who declares them:
**[grow_with_claudinite](../../../packs-tests/grow_with_claudinite/README.md)** (member-side: extract + dedup + pack
discovery, seeded, opt-out by removal) and **canon-curation** (this pack, the central stage).

```
EXTRACT   per member    → auto-merging PR against the member's main   (grow_with_claudinite)
PROMOTE   central, once → PR against Claudinite's main                (canon-curation)
DEDUP     per member    → PR against the member's main                (grow_with_claudinite)
```

All three are ordinary, **independent** planner units — there is no barrier and no phase ordering.
Each stage reads only what is already **merged**: promote processes whatever sits on members' mains
when it runs, so a lesson extracted tonight is promoted **tomorrow** night (the extract PR's merge
shows up in the next night's local-pack signal), and reaches other members' dedup once the promote PR
is approved and merged. That approval was always the dominant latency, so the barrier machinery bought little;
if the cadence ever matters, promote can run more often (twice daily, or before and after the
nightly) without any design change.

**Review gates by blast radius, not uniformly.** Promote opens a PR — it's the sole judgment gate
before the shared canon every repo reads, so it always needs a human eye. Dedup opens a PR too — a
wrongful prune deletes a real local lesson. Extract lands through an **auto-merging PR** against the
member's `main` — it writes only that project's own local packs, so it earns a CI gate and a PR trail
but not a human reviewer; auto-merge keeps the fleet's daily lesson-capture from flooding review
requests. (An owner-requested, in-session retrospective delivers a PR for a human to review — see
[extracting-lessons.md](../../../packs/grow_with_claudinite/extracting-lessons.md).)

**Central execution, no plumbing.** Promote runs from the Claudinite home repo with a fleet-wide
token, so it reads every participating member and opens its canon PR directly here — no
consumer-side Action, no cross-repo PAT, no labelled-issue up-path. The planner hands its gate the
`fleetMembers` aggregate (which members changed, and what they declare), and the gate hands the
worker the changed participants as `targets`.

The session-scoped sibling of this nightly lifecycle — mining a single working session for lessons
— lives with [the growth pack's extracting-lessons method](../../../packs/grow_with_claudinite/extracting-lessons.md)
(applied by its conversation-extract daily task over captured logs), and the member-side method docs
(extract, dedup, pack discovery, and how a project's local packs are identified) live with
[grow_with_claudinite](../../../packs-tests/grow_with_claudinite/README.md).
