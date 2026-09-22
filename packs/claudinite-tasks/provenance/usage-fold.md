## 2026-07-29 · born · Skill-usage metrics: enriched capture, per-repo fold, fleet aggregation (#524)
- **Source:** the skill-usage-metrics design document, implemented in full.
- **Reason:** counting skill loads is worthless without the denominators, so the fold counts both
  out of the logs the pack already captures: day rows recomputed statelessly inside the raw window,
  week rows appended once past a watermark. Every entry shape the counting classifies was verified
  against real captured transcripts rather than inferred, and the user-message count tests FOR the
  human marker rather than against a list of automated ones, so a new automated shape is excluded
  the day it appears instead of silently inflating the denominator.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a daily agentless task in packs/grow_with_claudinite, writing
  `.claudinite/local/usage.GENERATED.json` through the shared delivery primitive the same change
  added.
- **Landed:** #524 (Closes #520).

## 2026-08-19 · moved · Rename core to claudinite-lifecycle, grow_with_claudinite to claudinite-growth, and move the scheduled-task contract between them (#1029)
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task travels with its pack's rename, into claudinite-growth.
- **Landed:** #1029.

## 2026-08-23 · reworded · Collapse the frequency vocabulary and take the cron to two ticks a day (#1230)
- **Reason:** hourly went to daily, and the task's own window with it - sized to an hour while the
  task anchors daily, the "session captured" arm never fires again and a repo whose only movement is
  commit-less sessions silently stops folding.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1230 (Refs #1225, #1231).

## 2026-08-24 · moved · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task moves into `packs/claudinite-tasks/tasks/usage-fold/`, because it folds
  this mechanism's run records and outcome labels.
- **Landed:** #1326 (Closes #1325) · pack version 60824.1.

## 2026-08-31 · reworded · Scope the canon's own auto-merge policies to the folders their tasks write in (#1480)
- **Reason:** the policy was written before a folder could be named in one, so it stated a repo-wide
  KIND - any GENERATED file, including another task's delivery - where the task's real bound is a
  PLACE: the one file it writes under `.claudinite/local`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1480 (Refs #1479) · pack version 60830.9.

## 2026-09-02 · reworded · Dashboard redesign: the fleet ledger, the repo page and the Work board (#1616)
- **Reason:** the redesign's pages were specified against fold fields that did not exist yet, and
  the fields go first because they accumulate from the day they ship. Each follows the file's own
  rules - a tuple against the header, no key where the source could not answer, a week row grown
  from the first day that carried it - so an older reader decodes as far as its own header goes. The
  pull-request field carries each merged one's lead times as durations rather than percentiles,
  because a week's median is not derivable from its days'; the park counts come off each closed
  item's label EVENTS, because final labels say only where an item ended, never where it stopped on
  the way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1616 (Refs #1603, #1602, #1604, #1605, #1606, #1607) · pack versions 60902.5 and
  60902.6.

## 2026-09-13 · reworded · Redesign the session-start summary line (#1986)
- **Reason:** the per-pack token split left the line, so the fold reads the total off both the new
  and the legacy spelling and keeps parsing the split off legacy captures.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1986 (Refs #1985) · pack version 60913.3.

## 2026-09-13 · reworded · Drop the per-session rule-token metric from the fold and the dashboard (#1990)
- **Reason:** the fold stops parsing the session-start sentence for a token figure and drops the
  three rule-token fields; older files still decode by their own header.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1990 (Refs #1987) · pack version 60913.4.

## 2026-09-15 · reworded · Measure the machinery: run-cost records and the tasks-usage fold (#2046)
- **Reason:** four of this fold's writers - the queue counts, the parks, the per-task cost and the
  execution census - are marked deprecated, naming the new tasks-usage file as their successor.
  Their removal is a later plan rather than this change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2046 (Refs #1869, #1872) · pack version 60915.4.

## 2026-09-21 · policy-changed · the fold counts what the corpus did to a session (#2214)
- **Source:** docs/usage-review/DESIGN.md §4.1, the owner's design of 2026-09-21.
- **Reason:** the usage review's rules compare a declared expectation against a record, and the
  record carried loads but not why they happened, not how many moments a declared trigger actually
  had, not which guards fired, and not what the checks cost. Without those the rules could be
  written but not evaluated.
- **Mechanism:** ten counters and a format bump to version 4, counted in the fold's existing
  per-capture pass. The counting splits in two modules - what the session produced, and what the
  corpus did to it - because they answer different questions of the same entries. The engine's
  moment predicates and its `ownerSkill` stamp are probed rather than imported by name: they land on
  a different cycle from this pack, so a member holding an older engine records no key instead of
  failing to load, and a missing key reads as *not recorded* rather than as zero.
- **Rejected:** deduping a moment to the hook's once-per-session behaviour, which would compare a
  number to itself; the counter is occasions, and the artifact is named as a cause on the rule that
  reads it.
- **Retire when:** a counter goes two months without a rule reading it.
- **Landed:** #2214

## 2026-09-22 · policy-changed · the delivery target is handed in, never discovered (#1943)
- **Reason:** `deliverGenerated` kept a `branchPrefix`/`stamp` discovery path for the window in
  which a member's vendored executor predated the target hand-off (#1695). This caller now hands in
  the executor's resolved branch and nothing else, so there is one decision site for which branch a
  run delivers on rather than two that can disagree.
- **Mechanism:** the worker passes `branch` through from `CLAUDINITE_TARGET_BRANCH`; the delivery
  seam requires it and the discovery parameters are gone.
- **Actor:** claudinite/engine implement-request run, conflicts resolved and rebased in an owner
  session.
- **Model:** claude-opus-5
- **Landed:** #1943
