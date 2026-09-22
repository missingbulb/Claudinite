## 2026-09-21 · born · the one stage of the usage loop that changes anything (#2214)
- **Source:** docs/usage-review/DESIGN.md §6.4, the owner's design of 2026-09-21.
- **Reason:** the review cannot test its own remedies, and a skill that did not load has several
  causes of which only one is the description - a fix on a guess rewrites content that was right.
  So the proposal is separated from the observation, and the owner's merge is the only thing that
  lets a rule in the review take effect.
- **Mechanism:** a weekly agentic task over this repo's own local packs, `fresh_pr`, automerge
  `nothing`, gated on a finding that has stood two weeks with a cause a diff can argue from. The
  gate is what bounds the cost: a week with no lasting finding opens no session. It carries the edit
  itself rather than a description of it, because a proposal is worth only as much as the diff it
  can be read against.
- **Rejected:** acting on findings automatically, and letting any stage of the loop merge itself.
- **Retire when:** two months pass with proposals opened and none merged - the recommendations are
  then not worth acting on and the rules are revisited rather than this stage kept.
- **Landed:** #2214
