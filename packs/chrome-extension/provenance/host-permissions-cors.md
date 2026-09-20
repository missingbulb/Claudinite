## 2026-07-03 · born · promoted from a member's local pack (#108)
- **Source:** TLDR's local docs: `host_permissions` versus CORS, one of the four portable MV3 rules
  promoted together.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** prose; packs did not exist yet.
- **Landed:** #108 (Refs #106), the pre-pack corpus.

## 2026-07-11 · strengthened · the own-backend converse is folded in (#222)
- **Source:** the promote run's dedup against the corpus: a lesson from the fleet's local docs
  (gRatio, TLDR) folded into this bullet rather than added beside it, "a fold sharpening the
  host_permissions/CORS bullet".
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** #222 (Refs #99) · pack version 1.

## 2026-08-12 · split · the converse becomes `own-backend-no-host-permission`; this rule keys to the symptom (#775)
- **Reason:** a rule reached while debugging keys to the symptom rather than the act, so the trigger
  reads "A fetch to a host you listed failing in-browser".
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
