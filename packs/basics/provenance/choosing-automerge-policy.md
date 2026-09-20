## 2026-09-02 · born · converted from references.md (RULES-1)
- **Reason:** Owner decision, set while planning the dashboard chain (#1613): "The owner reviews are
  here not to make sure all code was created perfectly … Your ability to write code at fantastic
  speeds means that making sure a code is perfect is a goal that pales in comparison to get the code
  out the door and working. The things I now care about are much more specific: I fear destructive
  code that deletes data in production, or creates such a bad experience that users leave. Anything
  which isn't easily reversible with another PR. The second thing I care about is growth —
  separation of concerns, making sure the system is simple. Seeing which folders changed tells me a
  lot about if the change made sense; a 3-file change for a change I expected to be a one-liner
  gives me indications not of destructive errors, but of opportunities to learn. So when we create a
  long chain of tasks and set automerge rules — the goal is to have a good prediction of the
  change that would come from a feature request, and if that prediction holds — merge and move on.
  Automerge policy failing is a major speed bump, but it allows us to make sure the wagon is on the
  right trail." Reaffirm while a person still reviews chain PRs by their footprint; retire only if
  the owner redefines what review is for.
- **Mechanism:** prose
