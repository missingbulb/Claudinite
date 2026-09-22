## 2026-08-16 · born · Claudinite growth: mint the headless-browser canon pack (#905)
- **Source:** `missingbulb/ClaudiniteWebsite`'s interactive responsive check - the
  window-size-is-not-a-viewport footgun and the virtual-time budget.
- **Reason:** it cost that member a phantom bug hunt: the clamped, cropped render reads as a
  horizontal-overflow bug in every section of a page that has none, and the instinct is to go
  hunting through the CSS for an offender that is not there.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "A command-line window-size flag is not a viewport -
  a narrow one does not test the narrow layout.".
- **Landed:** #905 (tracker #642) · pack version 1.
