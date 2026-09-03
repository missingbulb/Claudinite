---
name: automerge-policy
description: Choosing the automerge policy a PR or a chain link carries — a prediction of the diff's shape, never widened to fit, and what a wide or irreversible change owes the reviewer. Use when opening a PR or filing a chain link that states an Automerge policy.
---

# Automerge policy

- **Choosing an automerge policy for a PR or a chain link** — write it as a prediction of the
  change's shape, the folders and kinds you expect the diff to touch, and never widen it to fit
  the diff that arrived: a policy that fails is the speed bump that puts a person back on the
  trail, not an error to route around. (1)

- **Predicting a change that could delete production data or degrade the experience past what a
  later PR undoes** — its policy is `nothing`, whatever its diff class; irreversibility is the
  first of the two things review here exists to catch. (1)

- **Handing over a change whose diff reached more folders or files than its request implied** —
  say so, and name the abstraction that would have kept it in one place: the reviewer reads
  which folders moved to judge whether the change made sense, and a wide diff for a small ask is
  the growth lesson review is for, not a defect. (1)
