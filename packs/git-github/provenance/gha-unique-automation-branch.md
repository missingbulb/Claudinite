## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a branch keyed only by the date collides with itself on a repeat run for the same key.
  Opened with the whole pack-and-check layer, in the pack that then owned workflow YAML.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check gha/unique-automation-branch, advisory, over the repo's workflow files; quiet
  where the branch name already carries a per-run-unique suffix.
- **Landed:** #128 (Closes #127, Closes #131).

## 2026-08-13 · converted · Declarative pattern-check engine: one shared pass, checks declared as data (#790)
- **Reason:** a rule whose whole logic is patterns over files is data, so it is declared rather than
  hand-coded; the engine then makes one pass over the tree for the whole family, reading each file
  and walking its lines once, instead of each rule looping every file. Id, severity and every
  message kept verbatim, and the shared workflow-file pattern became one exported constant.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `patternRule` declaration in place of the coded module, carrying no comments -
  the pattern plus its failure text is the whole check.
- **Landed:** #790 (Closes #789) · pack version 1.

## 2026-08-14 · moved · Declared checks are JSON, one file per pack (#827)
- **Reason:** the declarations were modules of about seventeen lines each, all of them data, so a
  pack's declared surface now sits in one `declared-checks.json` discovered structurally - no import
  and no manifest line, writing the declaration adds the check. The format drops what the
  declaration was borrowing from prose: no comments, which JSON enforces by construction, no
  `description` and no `doc` pointer, and `why` becomes `failureMessage` for what it is.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** an entry in the pack's `declared-checks.json` in place of its own module.
- **Landed:** #827 (Closes #826) · pack version 2.

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

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
