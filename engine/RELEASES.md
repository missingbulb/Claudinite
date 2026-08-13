# Engine releases

The engine ships as a **version**, not a stream of commits: `ENGINE_VERSION` in
[`version.mjs`](version.mjs) is what a member's stamp records, what an engine
migration's range is written against, and what a pack's `minEngineVersion` is
checked against (`docs/versioned-updates/DESIGN.md` §2). This file is the log of
those versions and the evidence behind each.

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
3. In the same change: bump `ENGINE_VERSION`, and add a row below for the new
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

Version 1's rehearsal is the automatic post-merge run against `8dbb096`, the
commit that introduced the constant — the procedure above landed after it, so
there was no branch to rehearse first. Version 2's was dispatched against its
own branch at `6607b7c`, which is this change's tree; the only edit after it is
the row you are reading.
