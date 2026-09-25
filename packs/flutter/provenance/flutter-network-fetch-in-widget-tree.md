## 2026-09-20 · born · a declared check beside the fetch rule, which stays prose (#2164)
- **Reason:** the widget-test binding blocks real HTTP with a 400-returning stub client, so a tree
  constructing its own network image or tile provider renders error boxes under every golden. Scoped
  to `lib/ui|screens|widgets` because that is the tree the pack's architecture keeps free of
  platform concerns; `main.dart` and the adapters beside it construct the real provider.
- **Actor:** @missingbulb (owner), on the canon-prose-to-checks task.
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check flutter/network-fetch-in-widget-tree, in the pack's `declared-checks.json`.
- **Retire when:** the binding serves real requests, or Flutter grows a first-class test-time image
  substitute that makes the constructor safe in the tree.
- **Landed:** #2164 (work item #2142) · pack version 60920.1.
