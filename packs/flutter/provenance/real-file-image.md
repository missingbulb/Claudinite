## 2026-09-06 · born · Promote the reviewed survivors of nine growth-promote PRs (#1671)
- **Source:** the reviewed survivors of nine growth-promote runs, consolidated into one change; the
  evidence names the members as a set rather than one per rule.
- **Reason:** the widget-test binding runs in a fake-async zone that advances virtual time only, so
  a real file read or image decode awaited bare never completes and the test hangs instead of
  failing - a symptom that sends a reader looking at the widget rather than the zone.
  `tester.runAsync` is the one way out of the zone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Real file or image I/O inside testWidgets needs
  tester.runAsync, not a bare await.".
- **Rejected:** a check. The consolidation converted every candidate whose signature the four-moment
  vocabulary could carry; this one has none - a bare `await` in a test is ordinary everywhere else.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.1.
