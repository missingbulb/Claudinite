## 2026-07-31 · born · a member needs an unfiltered conformance run on every pull request (#594)
- **Source:** a member whose three test workflows all filtered to its product tree, so a mount-only
  maintenance PR matched nothing, waited forever, and the same filters had hidden two blocking
  isolation findings on its main.
- **Reason:** auto-merge is a queue for checks, and a path-filtered flow is invisible from every
  angle: the repo looks like it has CI, the arm reports success, and no check ever runs.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded rule in the `basics` pack, advisory on purpose, relevance-gated on the
  vendored mount so it is inert in a non-member. Shipping it blocking would have turned every member
  without the workflow red on its next converge, which is the failure it exists to make less likely.
  A repo with no pull-request workflow at all is deliberately not flagged: that is a coherent shape,
  not a defect.
- **Retire when:** the promotion to blocking is a one-line change once the fleet carries the
  workflow.
- **Landed:** #594 (Refs #592).

## 2026-08-13 · reworded · it stops naming the retired converge mechanism (#791)
- **Actor:** @missingbulb (owner).
- **Landed:** #791.

## 2026-08-14 · moved · out of basics into this pack (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule judges whether Claudinite's checks actually gate a member's pull requests,
  which is this pack's scope rather than working discipline's.
- **Landed:** #836 (Closes #835, phase 1).
