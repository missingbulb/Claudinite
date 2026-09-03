---
name: configuring-the-fleet
description: Editing the fleet enforcer's own config entry — the exclude list, packSeeds, and the declaration that must agree with a seed. Loaded for any edit of .claudinite-settings.json in the enforcer repo.
metadata:
  force-load-on-file-edits-paths:
    - ".claudinite-settings.json"
---

# Configuring the fleet

- **Keeping a repo out of the fleet** — add its full `owner/name` to `exclude` on this pack's
  config entry. Nothing else opts a repo out: an archived or forked repo is reported as out of scope
  but still walked, and a repo that simply never adopted is `uncovered`, which is a finding rather
  than a choice. If a repo should not be measured, say so in `exclude` and the reports stop asking
  about it.

- **Adding or changing a `packSeeds` entry** — get it right *before* the sweep next runs. The
  sweep seeds and never overrides, so a wrong seed reaches each member exactly once and then sticks;
  correcting it here un-writes nothing, and undoing it is a change in every member's repo. Land the
  entry and its own declaration together, then read the next run's report rather than assuming.

- **Declaring a pack this fleet also seeds** — write the same config in both places, spelling
  every default out on both sides rather than leaving one implicit. `seeds-agree` compares them
  literally, because nothing in this pack may know what one pack's absent key means. A pack the
  fleet standardizes on but this repo does not itself run has nothing to agree with, and is fine.
