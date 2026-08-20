# Engine releases

The engine ships as a **version**, not a stream of commits: `ENGINE_VERSION` in
[`version.mjs`](version.mjs) is what a member's stamp records, what an engine
migration's range is written against, and what a pack's `minEngineVersion` is
checked against (`docs/versioned-updates/DESIGN.md` §2). This file is the log of
those versions and the evidence behind each.

The version is date-anchored `<day>.<n>` — `60820.1` for the first release cut on
2026-08-20. [`version.mjs`](version.mjs) states the shape and computes the next
one (`nextVersion`); rows 1 to 6 below predate the format and are the plain
counter it replaced.

## What a release is

**A release is the commit that bumps `ENGINE_VERSION`, and a bump is only
legitimate once the live canary rehearsal has passed against the tree being
released** (owner decision, 2026-08-12). There is no tag and no separate release
artifact: the updater clones `main` at its newest bumped ref, so the version lives
in the file the mount already carries and there is nothing to cut, push or forget.

The canary is what makes the snapshot *qualified*. It converges a real adopting
repo — running **its own** vendored worker, the copy a member would run — against
the ref under test, and asks whether that repo still works. The fixture rehearsal
on every PR only tests what someone remembered to model; this is the other half.

## Releasing

1. Have the change ready on its branch, CI green.
2. Dispatch **Canary rehearsal** with `ref` = your branch
   (`.github/workflows/canary-rehearsal.yml` → Run workflow), and wait for it.
   A red canary is not a release — fix the branch and rehearse again.
3. In the same change: set `ENGINE_VERSION` to `nextVersion` of the one standing
   — a new day restarts the running number at 1 — and add a row below for the new
   version linking the run that passed.
4. Merge. The version now on `main` is the release.

`engine-release-record` (the canon's own local pack) refuses a bump that arrives
without its row, or with a row citing no run — the canary runs in another
repository, so its run id is the only durable evidence the release was rehearsed,
and every member in the fleet is stamped with the number it qualified.

A change that touches the engine **without** bumping the version is an ordinary
engine edit and needs none of this; members receive it on their next converge as
they always have. The bump is what says "this snapshot has been qualified" — so
bump when a migration needs a version to range against, or when a release is
worth naming, not on every merge.

## The log

| Version | Date | Canary rehearsal | What it released |
|---|---|---|---|
| 1 | 2026-08-12 | [run 31628529342](https://github.com/missingbulb/Claudinite/actions/runs/31628529342) | The first numbered engine: version scaffolding, the versioned stamp, and migration records re-homed under their owning flow (#769). |
| 2 | 2026-08-12 | [run 31633584458](https://github.com/missingbulb/Claudinite/actions/runs/31633584458) | Migration records gain regex rewrites and the `normalizeLocalDeclarations` codemod, and `local-pack-namespace` starts rewriting local-pack declarations to `local/<id>` — the first release whose records actually change a member's own files. |
| 3 | 2026-08-13 | [run 31655440833](https://github.com/missingbulb/Claudinite/actions/runs/31655440833) | Baselining retired (#768 Phase 5): the task, its escalation codes and the `migrations/` compatibility entry points are gone, the `agentic:` migration field is rejected rather than ignored, and `updates` becomes the default mechanism. Freshness is measured by version rather than by the age of a ref the update flows never write. |
| 4 | 2026-08-14 | [run 31826589868](https://github.com/missingbulb/Claudinite/actions/runs/31826589868) | A `needs-human` dispatch issue no longer stops its task (#821): the scheduler's guard suppresses on a live claim rather than on any open issue, so an escalation awaits triage instead of shutting the lane until a person closes it by hand. Bounded — a second unresolved escalation holds the lane, under a verdict of its own that leads the run summary. |
| 5 | 2026-08-19 | [run 32267881121](https://github.com/missingbulb/Claudinite/actions/runs/32267881121) | The pack renames (#1022): `core` → `claudinite-lifecycle`, `grow_with_claudinite` → `claudinite-growth`, and the scheduled-task authoring contract moved between them. The record converges each member's declaration and moves its mount directories; the loader tolerance (`engine/pack_loader/renamed-packs.mjs`) makes that record's timing irrelevant by resolving both spellings, so no member can be caught holding a declaration and a mount that disagree — which for the pack carrying `update` would cost it the machinery that delivers its own repair. |
| 6 | 2026-08-19 | [run 32270294377](https://github.com/missingbulb/Claudinite/actions/runs/32270294377) | The declaration half of the pack renames (#1041). Version 5 moved every member's mount directories and stamped `packVersions` keys but never rewrote the `packs` array: it did that textually, anchored on `"packs": [` so a member's own `{ "from": "core" }` barrier rule could not be caught by accident, and the anchor could not cross the nested array in an entry object like `{ "id": "barriers", "via": ["basics"] }`. Replaced by a structural op (`applyPackRenames`) driven by the engine's own rename map. A separate record because a repo already stamped 5 never runs the 5 record again — and a converged member is exactly the one whose declaration still needs moving. |

Version 1's rehearsal is the automatic post-merge run against `8dbb096`, the
commit that introduced the constant — the procedure above landed after it, so
there was no branch to rehearse first. Version 2's was dispatched against its
own branch at `6607b7c`, which is this change's tree; the only edit after it is
the row you are reading.

Version 3's was dispatched against `9f5162a` — this change's tree, with only the
row you are reading edited after it — and it is the first rehearsal in weeks that
actually rehearsed anything. The gate had been driving the canary's
vendored BASELINING worker, which stood down and exited 0 the moment the canary
flipped to `updates` — a green step that converged nothing, for every core
change since 2026-08-12. Version 2's rehearsal predates the flip and was real;
what run 31654827686 qualifies is both this tree and the repaired gate, which
now fails unless the run says in words that it converged.

Version 4's was dispatched against `e416aed1` — this change's tree, with only the
run id in the row you are reading edited after it.

Version 5's was dispatched against `93ca7bd` — this change's tree, with only the
run id in the row you are reading edited after it. It converged the canary through
BOTH flows (`update: engine`, then `update: packs`) and the converged tree passed
its self-test, which is what qualifies the rename specifically: the canary held a
declaration and a mount spelled the old way when the run began, and the packs
loaded anyway.
