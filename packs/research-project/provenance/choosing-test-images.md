## 2026-09-22 · born · a harness confirmed its algorithm instead of testing it (#2032)
- **Source:** NoRFinder, where a detection harness was built on images chosen for it.
- **Reason:** images picked to suit the algorithm encode the assumptions the algorithm already
  makes, so the harness agrees with it by construction and reports strength it has not measured.
  Choosing the set against the real input distribution instead is what makes a pass mean anything.
- **Mechanism:** prose in this pack's RULES.md, keyed to the act of choosing the images, which is
  when the bias is introduced and the only moment it is cheap to avoid.
- **Retire when:** the harness draws its set from a recorded real distribution, so the choice is no
  longer the author's to make.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and deduplicated in an owner
  session.
- **Model:** claude-opus-5
- **Landed:** #2032
