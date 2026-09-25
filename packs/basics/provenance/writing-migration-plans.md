## 2026-09-02 · born · converted from references.md (writing-migration-plans-1): "How many human gates the chain expects."
- **Reason:** Same decision as RULES-1: the sizing questions and the breakage cases were the ones
  the owner asked while planning #1602, and asked to have made into the planning skill "highlighting
  the importance of continuation".
- **Mechanism:** a step of the writing-migration-plans skill, a workflow

## 2026-09-06 · strengthened · converted from references.md (writing-migration-plans-2): "The automerge policy per link, beside the prediction it came from"
- **Reason:** Same owner statement as RULES-5; this entry carries the three required contents of the
  submission (step lines, dependency graph, per-link automerge policy with its predicted diff) and
  the placement of the gate before any issue is filed.
- **Mechanism:** a step of the writing-migration-plans skill, a workflow

## 2026-09-06 · strengthened · converted from references.md (writing-migration-plans-3): "What each split has to buy."
- **Reason:** Owner, on the plan-approval change: "the point of separating detailed plans to many
  tasks is to have validatable checkpoints. If you have 2 big tasks on totally different parts of
  the system - it makes sense to split them to tasks, with different automerge rules, independent
  completion and production validations, etc. But if you have a large task and you just split it in
  two tasks that do work in the same place - there's no need for that, and it's only adding toil."
  The sizing section sorted steps into phases and divisions but never named the test a split must
  pass, so more links read as always the safer choice.
- **Mechanism:** a step of the writing-migration-plans skill, a workflow
- **Retire when:** Retire if a per-link cost ever drops to where splitting is free.

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5

## 2026-09-22 · reworded · the queue mark it tells a session to apply is named literally
- **Reason:** "for the queue" and "a tagged … issue" left the label to the reader, who invented
  one; `task:origin:ad-hoc` is the spelling a scheduler run adopts.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
