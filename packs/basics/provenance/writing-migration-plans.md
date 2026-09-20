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
