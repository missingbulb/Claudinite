---
covers:
  - check: cer/release-workflows
status: live
---

## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks.
- **Reason:** a repo that publishes carries the standard's orchestrator workflow with the standard's shape, or it cannot release the standard way.
- **Actor:** owner.
- **Model:** trailer: Claude Fable 5.
- **Mechanism:** a world-scope coded check over `.github/workflows/`.
- **Rejected:** unrecovered.
- **Retire when:** the pipeline stops being a vendored contract every extension repo hosts.
- **Evidence:** #128 (Refs #127).

## 2026-07-10 · reworded · one stub named "Release to Chrome Store", explicit `release.config`, daily at 00:30 UTC (#205, #214)
- **Actor:** owner.
- **Evidence:** #205, #214.

## 2026-07-13 · reworded · the check requires the vendored set under the repo's own `.github/` (#280)
- **Reason:** the reusables and composite actions now live in each repo; the pre-vendoring `@main` shape is tolerated while the vendoring migration is recent, since baselining re-materializes it.
- **Actor:** owner.
- **Evidence:** #280.

## 2026-08-21 · reworded · the orchestrator's bump dispatch joins the expected calls (#1151)
- **Actor:** owner.
- **Evidence:** #1151.

## 2026-09-03 · strengthened · the tolerated `@main` shape reports an advisory, and the tolerance retires on a window (#1645, #1653)
- **Reason:** a repo never told it still makes those calls is what held the removal gate shut; the tolerance now fires an advisory naming the window its tolerance ends on, annotated `@legacy-tolerance advisory:cer/release-workflows retire:#1643`.
- **Actor:** owner.
- **Rejected:** gating the removal on "no repo still makes those calls" — a census the canon cannot take, since it cannot see which members are live, inert or stale.
- **Evidence:** #1645 (Refs #1637), #1653 (Refs #1652), the removal issue #1643; VERSIONS.md 60903.3 and 60903.4.
