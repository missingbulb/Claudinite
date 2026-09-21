## 2026-07-28 · declined · the feature-detect, embedded-map and divIcon-transform rules as checks (#510)
- **Source:** the daily prose-to-checks sweep, which weighed every rule in the pack while converting
  the CDN pin and SRI one.
- **Reason:** runtime and layout-intent behaviours with no artifact signature - nothing a post-hoc
  scan of the repo can see decides whether a map is embedded mid-page or whether a transform will be
  clobbered.
- **Actor:** the daily prose-to-checks sweep run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #510 (Refs #504, #450) · pack version 1.
