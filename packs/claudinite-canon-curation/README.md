# claudinite-canon-curation

Curation duties for a **canon** — a repo whose own `packs/` tree is a shelf of Claudinite packs
that other repos vendor. Declaring this pack is what makes a repo that canon's home: it takes on
promoting its members' lessons onto the shelf, sweeping the fleet's stacks for technologies the
shelf does not yet home, keeping what the shelf already teaches current with those technologies,
and policing the shelf's own content.

Nothing in the pack names a particular canon. The shelf is `packs/` because that is where the
engine reads a canon's packs from, so every rule and task here is anchored there and is inert in a
repo that keeps no shelf. `hidden`, never seeded, no fingerprint: a canon home is a role somebody
assigns, so the pack is declared by hand.

A canon that runs Claudinite as an ordinary member reads its own packs from the mount, so its shelf
is content it *publishes* rather than content it runs — and the rules here are what police it. The
Claudinite home repo is the one exception, running the engine from its own root, and that changes
nothing about this pack.

**Declaration cardinality is the mechanism.** A pack's tasks run once per *declaring* repo, so a
canon declared by its one home repo yields exactly one work item per task per occurrence — "central,
once" with no bespoke orchestrator step. Un-declaring the pack freezes canon absorption without
touching the members' side ([claudinite-growth](../claudinite-growth/README.md)).

## Configuration

The pack entry takes one optional key, read by [canon-config.mjs](canon-config.mjs):

```json
{ "id": "claudinite-canon-curation", "config": { "write_paths": ["packs", "skills"] } }
```

`write_paths` names any corpus root **beside** the `packs/` shelf that a promoted lesson may land
in — a canon that organizes some shared content outside its shelf says so here. The shelf is always
a corpus root and is never removable. Unset is the ordinary case, not a misconfiguration.

The two fleet tasks reach every member, so both declare `invocation_endpoint: 'fleet'` — a key into
the declaring repo's own `taskScheduler.endpoints`, mapping to a routine whose sources are that repo
**and every participating member**. That cross-repo reach is the whole reason a second endpoint
exists, and is exactly what must stay off the endpoint an ordinary hand-off calls. Reach is a
property of **which endpoint is called**, and of nothing else: there is no session scope anywhere in
the system, and no label routes a hand-off ([the writing-tasks
skill](../claudinite-growth/skills/writing-tasks/SKILL.md)). An endpoint the repo has not configured
— or one whose token secret is unset — converges the item to human triage naming what is missing,
on the item itself; if a task has quietly stopped producing anything, its most recent work item says
why.

## What it carries

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-promote` | a participating member changed its local packs in the window | a PR against the canon's default branch |
| `growth-discover-packs` | weekly, over every covered member | a PR against the canon's default branch, plus an adopt issue in each member that evidenced the pack |
| `upstream-watch` | monthly, over the packs that declared an upstream source | a PR against the canon's default branch |
| `pack-version-bump` | daily when commits landed under `packs/`, and on every push to the canon's default branch (its workflow) | a commit straight onto the canon's default branch |
| `pack-version-history` | weekly, when commits landed under `packs/` | a self-landing PR touching only `packs/*/VERSIONS.md` |

### Rules (`RULES.md`)

What a canon session follows when it names, configures, writes or polices a pack on the shelf.

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Segregation rules go through barriers | medium | complexity | prose: 31 words |
| Name a pack for its surface | high | correctness | prose: 24 words |
| Claudinite-feature packs take the prefix | medium | complexity | prose: 24 words |
| Read an unmounted skill from the tree | medium | correctness | prose: 37 words |
| Cross-pack paths must resolve everywhere | high | correctness | prose: 21 words |
| Universal values live in pack code | medium | complexity | prose: 36 words |
| Config validation is a JSON Schema | medium | complexity | prose: 33 words |
| No shared code between sibling packs | high | correctness | prose: 36 words |
| Pack modules stay import-light, no top-level await | critical | correctness | prose: 41 words |
| A failed pack load strands members | critical | correctness | prose: 33 words |
| A check change re-runs against main | high | correctness | prose: 35 words |
| Fix text matches the severity | medium | correctness | prose: 36 words |
| Transcript checks screen plain-text pseudo-turns | high | correctness | prose: 46 words |
| Stop-hook fixtures carry an interruption marker | medium | correctness | prose: 35 words |
| An authoring-time how-to becomes a skill | low | complexity | prose: 35 words |
| Re-verify doc pointers after a move | medium | correctness | prose: 36 words |
| Two signals for a missing-or-misnamed check | high | correctness | prose: 40 words |
| Widen a check to its sibling surface | medium | correctness | prose: 28 words |
| Assert a path-pattern scope is non-empty | high | correctness | prose: 45 words |
| Grep a named directory before shipping | medium | correctness | prose: 21 words |
| Measure whether a check earns its keep | low | performance | prose: 43 words |
| RULES.md instructs, never describes | medium | complexity | prose: 64 words |
| Mechanize a re-derived procedure | low | performance | prose: 29 words |

### Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `pack-no-enforcement-narration` | medium | complexity | check: blocking |
| `pack-discovery-entry-await` | critical | correctness | check: blocking |
| `skill-no-enforcement-narration` | medium | complexity | check: blocking |
| `pack-independence` | high | correctness | declared check: blocking |
| `pack-directory-kebab-case` | high | correctness | declared check: blocking |
| `corpus-count-in-prose` | low | complexity | declared check: advisory |
| `home-only-path-in-canon-prose` | high | correctness | declared check: blocking |
| `named-import-of-new-engine-export` | critical | correctness | declared check: blocking |

`pack-independence` is barrier **data**, not code: a `forbidReferences` entry in
[declared-checks.json](declared-checks.json), compiled by the engine's reference scanning. The
[barrier guide](../basics/barriers.md) documents the edge vocabulary.

- **[tasks/growth-promote/](tasks/growth-promote/task.md)** — the growth lifecycle's central stage:
  read the changed members' local packs, **generalize** the portable lessons, route each to the
  right home on the shelf, and open a PR for the owner to approve. When a portable lesson's
  technology has no pack home, it mints a fingerprinted **stub pack** (in its own dedicated PR).
  This is the sole judgment gate before shared canon.
- **[tasks/growth-discover-packs/](tasks/growth-discover-packs/task.md)** — the weekly **fleet
  sweep** for technologies the shelf does not yet home: read every member's stack, fold the members
  into one view (so first-sight dedup is free — the third member using a technology is the same gap
  as the first), and open an owner-reviewed PR authoring the missing `packs/<tech>/`. A pack is
  authored because particular members' files demonstrated it, so each of those members also gets an
  issue asking it to adopt the pack once the PR merges and its mount carries it. It is the only
  stage that authors a pack at all — a member's local packs are what adoption seeded, and
  growth-extract writes rules into those. (Promote's stub-minting is narrower still: one lesson's
  technology, minted as a seed; this task authors from the whole fleet's usage.)
- **[tasks/upstream-watch/](tasks/upstream-watch/task.md)** — the monthly reconciliation of the
  shelf against the technologies it teaches: read what each declared source has published since its
  anchor, correct the packs that were dated by it, and advance the anchors. **Keeping a pack current
  is the canon's duty, not the pack's** — a pack's tasks are work a member repo runs, so a pack
  watching its own technology would put the duty on every consumer and make it unrepeatable. It
  reads no member and no member's dependency versions; the shelf is the whole subject.

  A pack opts in with an `## Upstream` section in its `README.md`, one line per source:

  ```md
  ## Upstream

  - **RFC 8725 — JWT Best Current Practices** — https://www.rfc-editor.org/rfc/rfc8725
    — reconciled through RFC 8725 (BCP 225), February 2020
  ```

  What to watch, where it publishes, and the state the pack's content was last reconciled
  against — the anchor the next run windows on, advanced only for a source that run actually
  read. Silence is opt-out: a pack with no section is one nobody has claimed a moving upstream
  for, and this task does not give it one. The reason a source is worth watching, and what a
  reconciliation concluded, belong in the pack's `references.md`.

- **[tasks/pack-version-bump/](tasks/pack-version-bump/README.md)** — the one writer of a pack's
  `version`. A pack's directory reaches a member only when the canon's number exceeds the
  member's, so every shipping change needs a fresh one and no two changes may share one; the
  worker reads the base branch after a merge, finds each pack's last bump and cuts today's next
  version for every pack with a shipping change since. A pull request never bumps a pack itself,
  and no check asks it to. The canon's `pack-versions.yml` workflow runs the same worker on every
  push to the default branch; the daily task covers the merges GitHub turns into no push run.
- **[tasks/pack-version-history/](tasks/pack-version-history/README.md)** — the weekly derivation
  of each pack's `VERSIONS.md` from git: which pull requests landed between one version and the
  next. Rows already written stand; only the versions with no row gain one.
- **[item-routing.md](item-routing.md)** — the shared worthiness + routing method promote (and an
  owner-requested retrospective pass) defers to, so every decision about admitting and placing an
  item is made the same way.
- **[promote-scope.mjs](promote-scope.mjs)** — the write-surface gate on promote's PRs: promote may
  write only under the corpus roots above. The canon's own CI invokes its `runCli`, keyed on the
  promote branch prefix; nothing in a tree marks a diff as a promote run, so the gate cannot
  self-gate.
- **[skills/generate-project-instructions/](skills/generate-project-instructions/SKILL.md)** — the
  pack-writing method both tasks above apply: decompose a project into its facets, sort its rules to
  the one owner each, author the packs those facets earn. Whether a project's insight becomes a pack
  every repo can declare is the canon's call, so the method sits with the stages that make it rather
  than in what a member reads.
- **[skills/writing-claudinite-skills/](skills/writing-claudinite-skills/SKILL.md)** — authoring a
  skill in the corpus. Canon-side activity: a member authors no corpus skills.

## The growth lifecycle — three independent stages, no barriers

How a lesson is learned in a consuming project, lifted onto the shelf when it's portable, and pruned
back out of the project once the canon owns it. Two packs split it by who declares them:
**[claudinite-growth](../claudinite-growth/README.md)** (member-side: extract + dedup, seeded,
opt-out by removal) and **claudinite-canon-curation** (this pack, the central stage).

```
EXTRACT   per member    → auto-merging PR against the member's default branch  (claudinite-growth)
PROMOTE   central, once → PR against the canon's default branch                (this pack)
DEDUP     per member    → PR against the member's default branch               (claudinite-growth)
```

All three are ordinary, **independent** planner units — there is no barrier and no phase ordering.
Each stage reads only what is already **merged**: promote processes whatever sits on members'
default branches when it runs, so a lesson extracted tonight is promoted **tomorrow** night (the
extract PR's merge shows up in the next night's local-pack signal), and reaches other members' dedup
once the promote PR is approved and merged. That approval was always the dominant latency, so
barrier machinery would buy little; if the cadence ever matters, promote can run more often without
any design change.

**Review gates by blast radius, not uniformly.** Promote opens a PR — it's the sole judgment gate
before the shared canon every member reads, so it always needs a human eye. Dedup opens a PR too — a
wrongful prune deletes a real local lesson. Extract lands through an **auto-merging PR** against the
member's default branch — it writes only that project's own local packs, so it earns a CI gate and a
PR trail but not a human reviewer; auto-merge keeps the fleet's daily lesson-capture from flooding
review requests.

**Central execution, no plumbing.** Promote runs from the canon home repo with a fleet-wide token,
so it reads every participating member and opens its canon PR directly there — no consumer-side
Action, no cross-repo PAT, no labelled-issue up-path. The planner hands its gate the `fleetMembers`
aggregate (which members changed, and what they declare), and the gate hands the worker the changed
participants as `targets`.

The session-scoped sibling of this nightly lifecycle — mining a single working session for lessons —
lives with [the growth pack's extract-from-conversations
skill](../claudinite-growth/skills/extract-from-conversations/SKILL.md), and the member-side method
docs (extract, dedup, and how a project's local packs are identified) live with
[claudinite-growth](../claudinite-growth/README.md).
