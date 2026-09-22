## 2026-09-22 · born · placeholder; this pack's history is not yet backfilled (#2230)
- **Reason:** the file was empty when this run corrected the rule's pointer, and the shallow
  checkout here reaches no commit that adds the rule, so nothing honest can be said about its
  origin. The rule's real history is the backfill's to derive (#2178), and its sanctioned rewrite
  replaces this entry.
- **Mechanism:** prose in this pack's scheduled-tasks section, read by every session here; the
  carrier is unchanged by this run and its choice is the backfill's to record.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2230.
- **Model:** claude-opus-5

## 2026-09-22 · reworded · the helper it named had moved (#2230)
- **Reason:** the rule cited `packs/claudinite-tasks/deliver-generated.mjs`; the helper is
  `deliverGenerated` in `packs/claudinite-tasks/public/delivery.mjs`, and the rule now names the
  export too, so a later move of the file leaves the symbol findable.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2230.
- **Model:** claude-opus-5
