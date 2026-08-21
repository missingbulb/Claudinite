# Version history

Records for `packs/claudinite-dashboard/pack.mjs`'s `version` field, one row per bump. The
rows below are version-numbered comments that used to sit beside `version:` in the manifest,
moved here verbatim; nothing earlier than the first of them was backfilled. Every bump from
here forward adds its own row.

| Version | Date | What changed |
|---|---|---|
| 7 | — | The fleet-digest task arrives from the claudinite-fleet-sheepdog pack, with its two checks. A declaring repo gains a daily task; nothing in a member is rewritten, and the task still reads an enforcer's existing `claudinite-fleet-sheepdog` config as its legacy source, so the bump carries no migration record. |
| 8 | — | The FLEET_GITHUB_TOKEN the digest needs is stated once, in its own fleet-token.mjs, and rendered into the missing-secret message, the adoption step and a 403's hint — additive, no migration (#1030). |
| 9 | — | Adoption hands over the sign-in decision as well as the Pages setting — prose and a handover entry, so a member gains a checkbox and nothing else changes. |
| 10 | — | The page carries a favicon — a file the mount has to deliver, so the version moves; nothing in a member's tree changes shape and there is no migration. |
| 11 | — | Mount freshness judged on stamped versions against the canon's live ones (never ref/updated), and the scheduler panels re-derived for the standing-item model — next asks, roll records, triage-split parks. Page-only; no migration. |
| 12 | — | The workflow-practice neighbour is git-github now that github-actions collapsed into it (#1079). |
| 60820.1 | — | Versions become date-anchored (#1100) — the counter this list is written in retires here, and every pack in the canon restarts from the same day. |
| 60820.2 | — | Fleet-digest's machine-issue filter learns the schedule board's `[claudinite-schedule]` title (#1115). |
| 60821.1 | — | Item state, triage and parked counts are decoded from the label vocabulary rather than matched literally, so a member's items read the same whichever engine filed them (#1119). |
| 60821.2 | — | Both pages are rebuilt around the repos' own usage folds (#1158). The repo page gains at-a-glance tiles, one work table with three views in place of the roster and queue tables, an hourly runs graph and a month of what the corpus is doing; the fleet page reads each member's usage file and enumerates its roster from an `owner` as the viewer rather than from a stored list. Which dashboard a deployment builds is decided by that config's shape, so nothing is asked at adoption. Page-only: a member gains panels and nothing in its tree changes shape. |
| 60821.3 | — | Which dashboard a deployment builds is DECLARED, not inferred from whether a roster source happens to be present. `mode` is the one config key with no default: the build refuses to publish without it, and refuses a mode that contradicts the rest of the config. A member that had let silence mean "repo" is stamped with `mode: "repo"` by this pack's migration record. |
| 60821.4 | 2026-08-21 | This pack's inline version-history comments moved out of `pack.mjs` into this file. |
