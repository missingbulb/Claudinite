## 2026-07-23 · born · grow_with_claudinite: add dedup-prune-integrity check (machine backstop) (0c67356e)
- **Reason:** a prune that rephrases a canon rule into a local restatement, or that grows the pack
  it prunes, is the failure no human reviews - the run auto-merges.
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** check dedup-prune-integrity, in
  packs/claudinite-growth/workRules/dedup-integrity.mjs.
- **Landed:** commit 0c67356e.

## 2026-07-27 · scope-changed · dedup-prune-integrity: a commit that says "dedup" is not always a dedup run (#465)
- **Reason:** the shrink arm was scoped by commit message alone, so a branch FIXING the dedup
  routine matched it; confining the run to the local-pack surface discriminates.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the shrink arm gains a second condition beside the commit-title match - every
  changed path under a local-pack root - because a real prune never edits the canon.
- **Landed:** #465 (Refs #394).

## 2026-08-12 · reworded · Growth dedup: method moves into a pack skill; growth-write-scope gates the capture runs' write surface (#492)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #492 (Closes #491).

## 2026-09-13 · scope-changed · growth-dedup auto-merges the whole local-pack tree (#1949)
- **Reason:** a line-count invariant is blind to a strip that re-wraps, so the arm gains a
  character-length measure.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the shrink invariant measures characters as well as lines.
- **Landed:** #1949 (Closes #1948).
