## 2026-07-12 · born · Fleet maintenance planner: code-decides / agents-act, pack-contributed run_daily tasks (#242)
- **Reason:** the fleet executor is dispatch-driven by design, so a `schedule:` on it is a contract
  violation rather than a configuration choice; the check enforces the scheduling contract the
  planner was built on.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check gha/no-scheduled-fleet-executor, blocking, over the repo's workflow files; it
  spares a dispatch-only executor and an ordinary cron on any other workflow.
- **Landed:** #242 (Refs #241).

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
- **Reason:** kept repo-only where its siblings widened. It asks who owns the one cron a repo is
  permitted, which is a fact about the adopting repo rather than about the file, and it fires
  falsely on a release orchestrator stub whose daily cron is its documented design.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `scanFiles` stays `.github/workflows/`.
- **Landed:** #1597 (Closes #1596) · pack version 60902.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
