---
covers:
  - rule: RULES.md — Matching a host with `chrome.events.UrlFilter`
status: live
---

## 2026-07-18 · born · promoted from a member's local pack (#319)
- **Source:** GoogleCalendarEventCreator's local pack: a `declarativeContent` page rule meant for the product's own site was satisfied by a lookalike host.
- **Reason:** `hostSuffix` is a raw string suffix, so `"example.com"` also matches `evilexample.com`; nothing at the call site says so, and `PageStateMatcher.pageUrl` gates an action icon or page condition on exactly these filters.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered (no trailer on the squash commit).
- **Mechanism:** prose. A check would have to know which behaviours are origin-sensitive; a bare `hostSuffix` is the signature of a correct rule as often as of the trap.
- **Rejected:** none recorded.
- **Retire when:** Chrome documents `hostSuffix` as label-bounded, or `UrlFilter` is removed.
- **Evidence:** #319 (Refs #99).

## 2026-07-27 · reworded · the corpus-wide "when + what + one non-obvious fact" pass (#467)
- **Reason:** the `hostContains` clause and the "lookalike host silently satisfies a rule" sentence restated the rule; both cut, directive unchanged.
- **Actor:** owner.
- **Evidence:** #467 (Refs #466), per basics' rule-writing method.

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Reason:** every rule opens with the act the reader is performing, in bold, so the file scans by its left margin. Directive unchanged.
- **Actor:** owner.
- **Evidence:** #775.
