## 2026-06-23 · born · Add textAndFileManipulation.md + testingPractices.md corpus docs; let curation routine create new docs (#28)
- **Source:** the three text and file-manipulation bullets of `engineeringPractices.md`, split out
  into a corpus doc of their own.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** the repo-text-sweeps skill, body workflow, reached by its description.
- **Landed:** #28.

## 2026-06-24 · reworded · Add guidance on using Write tool for captured output (#31)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #31.

## 2026-06-25 · reworded · Centralize portable lessons from the GoogleCalendarEventCreator working set (8ff4d9d0)
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** commit 8ff4d9d0.

## 2026-07-03 · reworded · Promote portable lessons from GoogleCalendarEventCreator's local docs (c90f0c51)
- **Landed:** commit c90f0c51.

## 2026-07-11 · reworded · Lessons from the CrosswordChat #43 session: case-blind absence greps; re-rooted-main pull failures (#226)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #226.

## 2026-07-12 · reworded · Document the core/pack boundary; retire redundant and stale surface (#248)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #248, closing #247.

## 2026-09-27 · reworded · Claudinite canon: rule revalidation
- **Reason:** re-probed 2026-09-27: `/root/.claude/projects/<project>/<session>.jsonl` reads fine
  from the shell with `head`, so "inaccessible to shell commands" was the wrong reason for the right
  directive. What the path holds is the transcript as typed JSONL entries, which is what makes a
  `cp` produce escaped JSON records instead of the captured output.
- **Actor:** the canon-rule-revalidation task, running as work item #2349.
- **Model:** claude-opus-5
- **Retire when:** the transcript stops being the only thing at those paths, or a copy of one yields
  the file content.
