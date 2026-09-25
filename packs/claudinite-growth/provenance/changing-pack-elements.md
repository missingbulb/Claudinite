## 2026-09-20 · born · the one forced skill for the append and the README scope (#2176)
- **Source:** the provenance design (#2136), section 5.
- **Reason:** three skills from two packs load on carrier edits, one of them the basics pack's, and
  a growth mechanism cannot be written into it; one growth skill states the append once and reaches
  the README that no skill reached.
- **Actor:** @missingbulb (owner) approved the design; the session that wrote #2176 landed it.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a workflow skill forced on every pack file under either root (RULES.md, skills,
  checks, tasks, manifest, README, provenance), so the entry an edit owes is read at the edit.
- **Rejected:** teaching every editing skill the append.
- **Landed:** #2176.

## 2026-09-20 · reworded · shared files, an unmarked guideline's file, and a file that grows by advice
- **Reason:** the owner's decisions of 2026-09-20: several carriers may name one file while their
  history is one; a guidelines skill's unmarked bullet is the skill's; a lost or altered line is
  advised against, never refused.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.

## 2026-09-22 · reworded · the append-only rule, its one exception, and a kind for a scope change (#2248)
- **Source:** #2221, #2222 and #2223, filed from six backfill runs across nineteen packs.
- **Reason:** the skill said a provenance file is append-only and, a paragraph later, that the
  backfill may rewrite what the conversion wrote - two sentences with nothing connecting them, and a
  tool enforcing only the first. Every run hit the date-order refusal with no stated remedy and
  worked one out, differently. The exception is now named as the lane it always was, `--backfill` on
  both commands, with the two writes only it may make: replacing the conversion's own placeholder
  born, and opening the file for an element retired before the marking pass. `_pack.md` is ruled out
  for that second case because a retired entry seals the file it ends, and the pack's own file must
  stay appendable forever. `scope-changed` closes the gap the vocabulary had for a manifest or check
  change whose prose reads the same - runs were reaching for `reworded` on code changes because the
  already-backfilled packs had.
- **Actor:** @missingbulb (owner), who asked for the four tool issues fixed together.
- **Retire when:** the backfill of #2169 is finished and no flow needs to write a dated-in-the-past
  entry; the flag can then be withdrawn rather than explained.
- **Landed:** #2248 · the vocabulary change is in the engine helper's KINDS, so a member reads it
  only once its mount converges.

## 2026-09-22 · strengthened · an entry is sized to the decision, not to the work
- **Source:** the owner, on a regex repoint whose entry ran 25 lines.
- **Reason:** nothing here rationed length, and the field list read as a form to fill. The size norm
  sat in `writing-pack-prose`, which a check edit never loads.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.
- **Retire when:** entries are terse without it.

## 2026-09-22 · reworded · the size rule contradicted the field it bounds
- **Reason:** it said a required `Mechanism` names the carrier and stops, while the field list three
  lines above defines it as the carrier and why. A probe run wrote the why-clause and was right to.
- **Actor:** @missingbulb (owner), whose probe surfaced it.
- **Model:** Claude Opus 5.

## 2026-09-25 · reworded · the backfill lane replaces the placeholder with a same-day born too (#2317)
- **Reason:** a birth verified on the conversion's own date had no way in, since the tool refuses
  two borns.
- **Actor:** @missingbulb (owner).
- **Landed:** #2317

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
