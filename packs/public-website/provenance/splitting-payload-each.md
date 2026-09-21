## 2026-08-09 · born · static-website: four rules for the data the page fetches (#727)
- **Source:** missingbulb/EdFringeNow#309, fixed in missingbulb/EdFringeNow#310: an events site drew
  all 4,122 of its listings as sold out, mid-season. Its catalogue and its ticket-availability
  sidecar were split so each could cache on its own clock, four days and one; a commit in between
  corrected every performance time by an hour, moving every key in the sidecar. A visitor holding
  the older catalogue joined 3,751 of 60,115 statuses, and the 94% that missed came back
  status-unknown, which every consumer read as not-bookable. Nothing failed: no error, no console
  line, and, both files being inside their TTLs, no network request at all.
- **Reason:** content-addressed keys survive rows being added and removed, which is what they are
  usually chosen for, and not a systematic correction to the key itself, a timezone shift, a
  rounding change or a rename, which moves every key at once and joins the two halves to nothing.
  The join-rate assertion is the other half: a missing key returns "no data for this row",
  indistinguishable from a row that genuinely has none yet, so a check written as "at least one row
  joined" passed at 6%.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** prose.
- **Rejected:** a check for any of the four. They are judgements about a design rather than shapes a
  check can read off a tree.
- **Landed:** #727 · pack version 2.

## 2026-09-18 · reworded · Cut both packs' rules to the ration, evidence into references.md (#2101)
- **Reason:** every rule ran 150 to 200 words where the format asks for one sentence near 40, and
  several opened on a state of the world rather than on the act that brings a reader to them. Each
  is now keyed to what the reader is doing and carries only the consequence needed to apply it under
  pressure. Nothing is weakened and nothing is strengthened: the rationale and the evidence move to
  the pack's `references.md`, which no session loads, so a later pass can reaffirm or retire a rule
  from its recorded reason.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2101 · pack version 60913.2.
