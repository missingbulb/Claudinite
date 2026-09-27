## 2026-08-16 · born · Claudinite growth: mint the headless-browser canon pack (#905)
- **Source:** `missingbulb/EdFringeNow`'s fake-origin routing.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Use an https fake origin.".
- **Landed:** #905 (tracker #642) · pack version 1.

## 2026-09-27 · retired · converted whole into a declared check
- **Reason:** the finding's what/why/fix carry the bullet, reassurance about certificates included,
  so the deletion test cleared it. The check spares loopback, which browsers already treat as a
  secure origin - a narrowing of the rule as written, and the correct one.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** check headless-browser/insecure-fake-origin, in the pack's `declared-checks.json`.
