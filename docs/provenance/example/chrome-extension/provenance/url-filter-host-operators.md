## 2026-07-18 · born · promoted from a member's local pack (#319)
- **Source:** GoogleCalendarEventCreator's local pack: a `declarativeContent` page rule meant for the product's own site was satisfied by a lookalike host.
- **Reason:** `hostSuffix` is a raw string suffix, so `"example.com"` also matches `evilexample.com`; nothing at the call site says so, and `PageStateMatcher.pageUrl` gates an action icon or page condition on exactly these filters.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose. A check would have to know which behaviours are origin-sensitive; a bare `hostSuffix` is the signature of a correct rule as often as of the trap.
- **Retire when:** Chrome documents `hostSuffix` as label-bounded, or `UrlFilter` is removed.
- **Landed:** #319 (Refs #99) · pack version 1.

## 2026-07-27 · reworded · the corpus-wide "when + what + one non-obvious fact" pass (#467)
- **Reason:** the `hostContains` clause and the "lookalike host silently satisfies a rule" sentence restated the rule; both cut, directive unchanged.
- **Actor:** @missingbulb (owner).
- **Landed:** #467 (Refs #466) · pack version 1.

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Reason:** every rule opens with the act the reader is performing, in bold, so the file scans by its left margin. Directive unchanged.
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
