## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the packs-and-skills split left the corpus's existing prose unconverted, so the
  backlog needed a sweep of its own rather than waiting on the next lesson.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the prose-to-checks skill, body workflow, reached by its description.
- **Landed:** #128 (Closes #127, Closes #131).

## 2026-07-07 · reworded · Lesson: try a scoped structural parser before rejecting an FP-prone check candidate (#139)
- **Actor:** @missingbulb (owner).
- **Landed:** #139 (Closes #138).

## 2026-07-12 · reworded · Structure-review cleanups: co-locate pack tests, catalog drift-guard, doc/helper homes (#237)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #237 (Closes #236, Closes #216).

## 2026-07-13 · reworded · Dissolve growth/ into packs: canon-curation (home-only) + grow_with_claudinite; drop the growth barriers (#284)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #284 (Closes #281).

## 2026-07-20 · reworded · Local packs first-class: namespaced declarations; canon-curation moves to local_packs; local run_daily on by default (#361)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #361 (Closes #360, Closes #364).

## 2026-07-24 · reworded · Redesign Phase 2: only growth-promote stays fleet-scoped (e6620072)
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** commit e6620072.

## 2026-07-31 · reworded · basics: bar pinning and requirement-shaped rules from packs (#604)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #604 (Closes #603).

## 2026-07-31 · reworded · prose-to-checks: gate conversion on product-vs-procedure (#596)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #596 (Closes #597).

## 2026-08-01 · reworded · Growth extract: one task over both sources, driven by skills; prose-to-checks sweep goes weekly (#622)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #622 (Closes #621).

## 2026-08-17 · reworded · Growth extract: prefer declared checks over rule modules on the promotion ladder (#928)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #928 (Closes #927).

## 2026-08-27 · reworded · A new check declares when it was added, and is advisory for two weeks (#1379)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1379 (Closes #1378).

## 2026-09-15 · reworded · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #2047 (Closes #2044).

## 2026-09-22 · reworded · the queue mark it tells a session to apply is named literally
- **Reason:** "for the queue" and "a tagged … issue" left the label to the reader, who invented
  one; `task:origin:ad-hoc` is the spelling a scheduler run adopts.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-09-27 · strengthened · anchor a guardToolCalls Bash match to a command-start boundary
- **Source:** a member's own local pack, read by the `growth-promote` task's 2026-09-27 window: an
  unanchored `guardToolCalls` match there also fired on the pattern merely quoted inside an
  argument.
- **Reason:** a class-D conversion's authoring discipline was silent on anchoring, so an
  unanchored match reads as working in a fixture that happens to place the pattern at the start of
  every test string, and only false-positives once a real call carries it elsewhere.
- **Mechanism:** a step of the prose-to-checks skill, a workflow.
- **Actor:** claudinite-canon-curation growth-promote run.
- **Model:** claude-sonnet-5
- **Landed:** https://github.com/missingbulb/Claudinite/pull/2283

## 2026-09-28 · reworded · names the manifest as pack.json, or by role
- **Reason:** pack.json is the preferred manifest; where the text told a reader to list a module in
  pack.mjs, rules are found in worldRules/ and workRules/ and nothing is listed.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
