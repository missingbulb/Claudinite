---
status: live
---

## 2026-07-03 · born · promoted from a member's local docs (#108)
- **Source:** TLDR: a silent refresh with `prompt=consent` failed every time, silently.
- **Reason:** `launchWebAuthFlow({interactive:false})` can only complete a flow that needs no UI, so it must request `prompt=none`; `prompt=consent` always needs interaction.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose.
- **Rejected:** none recorded.
- **Retire when:** Chrome's non-interactive flow honours a consent prompt without a window.
- **Evidence:** #108 (Refs #106).

## 2026-07-27 · reworded · the "can only complete a flow that needs no UI" clause is cut (#467)
- **Reason:** it restated the directive; the one non-obvious fact (consent always needs interaction) stays.
- **Actor:** owner.
- **Evidence:** #467 (Refs #466).

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Actor:** owner.
- **Evidence:** #775.
