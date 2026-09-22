## 2026-07-28 · declined · never fabricate ground truth to make a dataset scorable, score at the tier the annotation supports
- **Source:** the 2026-07-27 growth-promote run's dedup pass over the fleet's local packs (#497).
- **Reason:** already carried verbatim by this pack, by the annotated-never-fabricated rule and the
  validation tiers it points at, so the candidate deduped out rather than being promoted.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).

## 2026-07-28 · declined · generated and committed output is regenerated, never hand-edited
- **Source:** the 2026-07-27 growth-promote run's dedup pass over the fleet's local packs (#497).
- **Reason:** already carried by this pack's source-of-truth rule and by the canon's own
  GENERATED-file discipline, so the candidate deduped out rather than being promoted.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
