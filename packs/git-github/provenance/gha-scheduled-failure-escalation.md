## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a scheduled run fails with nobody watching, so a workflow on a cron needs something
  that escalates its failure. Opened with the whole pack-and-check layer, in the pack that then
  owned workflow YAML.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check gha/scheduled-failure-escalation, advisory, over the repo's workflow files.
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
- **Reason:** kept repo-only where its siblings widened. It asks whether anyone watches a scheduled
  run, which is a fact about the adopting repo rather than about the file, and it fires falsely on a
  release orchestrator stub whose escalation lives in the reusable workflows it calls, out of that
  file's sight.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `scanFiles` stays `.github/workflows/`.
- **Landed:** #1597 (Closes #1596) · pack version 60902.1.

## 2026-09-06 · severity-changed · Promote the reviewed survivors of nine growth-promote PRs (#1671)
- **Source:** nine growth-promote pull requests - #1021, #1157, #1204, #1345, #1372, #1409, #1451,
  #1524 and #1661 - closed in favour of one reviewed consolidation.
- **Reason:** every candidate with a signature the four-moment vocabulary can carry rides a check
  rather than prose, each with a fixture that failed before its declaration existed and the prose it
  covers deleted whole.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the check widens to `workflow_run` and `repository_dispatch` triggers beside the
  scheduled one.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.2.
