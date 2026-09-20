## 2026-09-01 · born · converted from references.md (writing-tasks-1): "Every run is bounded."
- **Reason:** The bound and its best-effort enforcement are the task-code-work design's §2 and §6
  — see issue #394.
- **Mechanism:** a step of the writing-tasks skill, a workflow

## 2026-09-07 · strengthened · converted from references.md (writing-tasks-2)
- **Reason:** Owner correction on #1843: "Don't discuss how the PRs land in the task description.
  This should have been instructed in the skill on writing tasks." The rule against repeating a
  declaration in `task.md` already existed but listed field names, so the two worker docs that
  spelled the behaviour out without naming `expected_outcome` — `rule-revalidation` and
  `growth-dedup` — passed it, and `rule-revalidation`'s sentence was still describing a policy the
  declaration had moved off.
- **Mechanism:** a step of the writing-tasks skill, a workflow
- **Retire when:** Retire it if the landing story stops living in the declaration.

## 2026-09-13 · strengthened · converted from references.md (writing-tasks-3)
- **Reason:** Owner, 2026-09-13, on the fleet shepherd: "Ignore the 'mount freshness / claudinite
  update status', and 'tasks scheduler health' in the dashboard for repos with dormant
  claudinite-tasks packs. Also do not perform any fleet-wide operations on them." It reverses the
  earlier reading, in which dormancy stopped the scheduler but not the clock: with no converge and
  no fleet operation reaching the repo, a version gap there is a finding with no owner.
- **Mechanism:** a step of the writing-tasks skill, a workflow
- **Retire when:** Retire it if anything ever converges a dormant member's mount again.
