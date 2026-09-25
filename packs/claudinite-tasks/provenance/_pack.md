## 2026-08-24 · born · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Source:** PRs A, B and C of #1317, landed together because none of them is green alone.
- **Reason:** `engine/scheduler/` was 52% of the engine and no longer passed the engine's own
  membership test in extending.md - would every pack's content stop working without it? - because a
  repo that declares no tasks pack runs no scheduled work, and that is a supported state rather than
  a degraded one. The queue's meta-machinery came with it rather than staying where it historically
  landed, since its subject is this mechanism and nothing else: `task-janitor` from basics,
  `usage-fold` from claudinite-growth, and the two task-declaration checks from claudinite-growth.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, seeded at `--init` and never fingerprinted - a new repo gets
  scheduled work by default because the update task is what keeps its Claudinite current, and
  nothing in a repo's shape implies wanting a queue, so a fingerprint scan would suspect one
  everywhere. Adoption stays a moment a person is present, because it wires two workflow files and
  the routine endpoints a member cannot converge into place.
- **Landed:** #1326 (Closes #1325) · pack versions 60824.1 and 60824.2.

## 2026-08-30 · reworded · Auto-merge policies: expected_outcome 'none'/'pr' plus a granular, built-ins-first automerge field (#1464)
- **Reason:** the manifest gained a `seedOps` entry planting the `merge=ours` line that keeps
  `usage.GENERATED.json` conflicts resolving by re-running the fold, seeded only where no
  `.gitattributes` exists yet; a repo whose own file predates adoption was left to the advisory
  `generated-merge-driver` check instead.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1464 (Closes #1459) · pack version 60830.5.

## 2026-09-06 · reworded · Keep Claudinite's own bookkeeping inside .claudinite/: mount attributes, no README row (#1754)
- **Reason:** every line the corpus planted in a member's root `.gitattributes` was about a file
  inside `.claudinite/`, and git reads a `.gitattributes` in any directory against that directory,
  so the mount carries its own and the manifest's seed of a root file comes out. The converged file
  is constant - `*GENERATED* merge=ours` subsumes the named merge lines and covers whatever the
  mount generates next - so it never grows a line per artifact.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1754 · pack version 60906.4.

## 2026-09-06 · reworded · Move task design docs into packs/claudinite-tasks/docs/, carved out of the vendor set (#1813)
- **Reason:** the mechanism's design documents belong beside the pack whose subject they are, and
  the pack's `docs/` is carved out of the vendor set so no member pays for them.
- **Actor:** @missingbulb (owner).
- **Landed:** #1813 (Refs #1755) · pack version 60906.10.

## 2026-09-07 · reworded · claudinite-tasks: PRINCIPLES.md as the spec, the two-way claim guard, seven design docs deleted (#1887)
- **Source:** link P of #1869.
- **Reason:** the mechanism is written as testable Y-happens-when-Z claims grouped by role, each
  citing the scenario or unit test that proves it, with the simulator's coverage test rewritten as
  the two-way guard between the claims and the suite - every scenario cited by a claim, every
  citation resolving to a real test, seen to fail in both directions before landing. The seven
  design documents whose content the principles file, the README and the module headers now carry
  were deleted rather than trimmed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1887 · pack version 60907.3.

## 2026-09-14 · reworded · claudinite-tasks: roles as folders - src/<role>/, typed world ports, queue/ frozen as ABI (#1890)
- **Source:** link S1 of #1869.
- **Reason:** the pack was the old flat `engine/scheduler/` copied in whole - 32 modules at the
  root, a `queue/` that was both workflow ABI and most of the logic, and REST paths spread over a
  dozen modules. Every module now sits in the role it plays, the graph between the roles is
  one-directional and enforced, and `src/world/` is the only place that reaches outside. `queue/`
  keeps the six workflow entry points as runnable shims, because a member's workflows and routines
  name those paths literally. The published surface narrowed from `export *` to named exports
  measured from real demand, so reading the queue stopped being public.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1890 (Refs #1869, #1478) · pack version 60914.1.

## 2026-09-20 · reworded · Restructure the tasks pack's public surface behind shims and collapse its aliases (#2116)
- **Reason:** `public/` is re-laid as two documents and five modules, three of which are the
  definition `src/` builds on rather than a re-export of it, so the vocabulary, the grammar over it
  and the GitHub client import nothing of `src/`. Every retired `public/` path stays as a shim
  annotated `@legacy-tolerance`, because a member whose workflow or local pack still names one must
  keep working after its nightly converge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2116 (Refs #2115) · pack version 60920.1.

## 2026-09-20 · reworded · Delete the retired claudinite-tasks public/ shims (#2167)
- **Reason:** the convergence condition the re-layout stated had read back true - every member's two
  workflow files ran the `src/` entry points and no member's local pack imported a retired path,
  across fourteen member pull requests each with a green scheduler run - so the tolerance came out
  whole rather than in pieces: the 21 shims, the tolerated re-exports, the README's retired-path
  tables, and the advisory that had nothing left to fire on.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2167 (Closes #2115) · pack version 60920.2.

## 2026-09-22 · policy-changed · recovery is a phase of the run, not a task behind it
- **Reason:** the three-responsibility split (owner, 2026-08-06 - scheduler creates, executor
  executes, janitor cleans up) held while recovery could afford a day's latency. It could not: the
  janitor's repairs landed a tick late by construction, and the scheduler had already taken the
  executing-leash reclaim back for that reason. The split survives as a module boundary -
  `src/schedule/repair-rules.mjs` stays pure and is the only home for a repair verdict - rather than
  as a task boundary, so the pack no longer carries `task-janitor`.
- **Mechanism:** a phase of `planSchedulerRun`, before the ask, its effects threaded into the item
  list the ask reads. A verdict the shell may decline on a fresh read is not threaded, so the plan
  never hands the ask a world the run did not write.
- **Rejected:** moving only the two pickup-restoring rules and leaving the rest a daily task - it
  keeps the moving part the merge was for, and the remaining rules are indifferent to where they
  run.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
- **Landed:** #2262

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.
