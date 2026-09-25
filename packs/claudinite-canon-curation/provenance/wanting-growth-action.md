## 2026-09-15 · born · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Source:** #2044, the owner: this pack is the only one that touches `packs/`, and it performs the
  growth actions on the shelf through tasks loading claudinite-growth's skills.
- **Reason:** the shelf and a member's local packs are two corpora with two policies - `under:packs`
  here, `under:.claudinite/local` there - and one task cannot hold both: the config that widened a
  growth sweep onto the shelf made every canon-side run park outside its own policy.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Rejected:** the `pack_paths` config, whose description left the prose-to-checks sweep's README
  in the same change.
- **Retire when:** the two corpora merge into one write surface.
- **Landed:** #2047 (Closes #2044) · pack version 60915.3.
