## 2026-08-16 · born · Prose to checks: the macOS deployment floor, and a cron off the :00 stampede (#901)
- **Source:** the github-actions-scheduling skill's "Pick a minute off :00" guideline, converted by
  the weekly prose-to-checks sweep.
- **Reason:** a positive allowlist on the cron's minute field, reading the `:10-:50` band from the
  engine's own hasher rather than re-spelling it, because enumerating the bad spellings - a step
  value, a list, a range - would miss the next one. Deletion test: the prose stays whole, since the
  flow-form cron is deliberately not judged and the fleet-wide hash-the-repo-name remedy has no repo
  signature a scan can judge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check gha/cron-minute-off-the-hour, advisory, declared in the pack's
  `declared-checks.json` and scoped by parse to a `- cron:` item enclosed by a `schedule:` block, so
  a workflow input named `cron` and a commented-out line stay quiet; the vendored scheduler is
  excluded, another check already holding that one file to the same band blocking.
- **Rejected:** the coded module the first draft landed as. It hardcoded the vendored scheduler's
  path as a bare string beside the declarative `excludeFiles` field its own sibling already carried
  for the identical path, two entries up in the same file.
- **Landed:** #901 (dispatch #864, tracker #450) · pack version 2.

## 2026-08-20 · moved · Pack reorganization: two collapses and two renames (#1081)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the declaration moves into this pack's `declared-checks.json`, its id unchanged;
  the decision is on `_pack`.
- **Landed:** #1081 (Closes #1079) · pack version 5.

## 2026-09-02 · severity-changed · gha/* checks: scan a pack's workflow stubs, not just .github/workflows/ (#1597)
- **Reason:** a pack's seeded workflow is copied verbatim into every repo adopting it and judged
  there by these same checks, yet none of them had ever looked at a stub - so a defect shipped
  fleet-wide while being visible in no repo until after seeding, which is how the dashboard's Pages
  stub carried a piped `run:` with no bash default until a member re-seeded it and went red.
  Widening the patterns was not enough on its own: the canon did not declare this pack, so its
  checks never ran against the canon's own tree either, and it does now.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `scanFiles` widens from `.github/workflows/` to a pack's `stubs/workflows/` as
  well, this check asserting a property of the file itself rather than of the repo around it.
- **Landed:** #1597 (Closes #1596) · pack version 60902.1.
