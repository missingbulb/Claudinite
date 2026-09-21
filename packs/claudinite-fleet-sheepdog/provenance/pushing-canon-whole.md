## 2026-08-17 · born · pushing canon to the whole fleet now (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions.
- **Reason:** the levers ship their literal command in a fenced block rather than naming a script,
  which the corpus measured as the difference between 0-in-5 and 5-in-5 first-try invocations.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Pushing canon to the whole fleet now".
- **Landed:** #958 (Closes #954).

## 2026-08-23 · reworded · the give-up-the-follow decision is purged from the rule (#1294)
- **Reason:** the earlier decision that the lever does not wait was written down here and in both
  READMEs, and all of them became wrong at once. What was retired was a blind fixed wait every run
  paid whatever the fleet was doing; the poll that replaced it reads a real terminal condition, so
  an already-current fleet finishes on the first pass.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1294 (Closes #1293) · pack version 60823.2.

## 2026-08-24 · reworded · the create-work-item path follows the task surface into its own pack (#1326)
- **Reason:** the rule ships the literal command, so the command has to be the one that exists.
- **Actor:** @missingbulb (owner).
- **Landed:** #1326 · pack version 60824.1.

## 2026-09-14 · reworded · the create-work-item path follows the tasks pack's role folders (#1890)
- **Reason:** the rule ships the literal command, so the command has to be the one that exists.
- **Actor:** @missingbulb (owner).
- **Landed:** #1890 · pack version 60914.1.
