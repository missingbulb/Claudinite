## 2026-09-22 · born · the mount was read as canon's current word (#1886)
- **Source:** a run that stated a task's policy as canon's from the member's mounted copy.
- **Reason:** `.claudinite/shared/` is a snapshot at this repo's last-vendored version, so it
  answers what this member runs, never what canon currently says. The two diverge precisely when the
  member is behind - which is usually the reason somebody went looking. Reading canon's own
  `packs/<id>/` at its default branch costs nothing beyond a fetch that was needed anyway.
- **Mechanism:** prose in this pack's RULES.md, keyed to the act of reporting or judging rather than
  to the state, since the mistake is made while writing the claim.
- **Retire when:** the mount carries canon's current version rather than the last vendored one, or a
  read of it reports its own staleness at the point of use.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
