## 2026-09-20 · born · converted from references.md (check:flutter/network-fetch-in-widget-tree)
- **Reason:** The widget-test binding blocks real HTTP with a 400-returning stub client, so a tree
  that constructs its own `NetworkImage` / `CachedNetworkImage` / `NetworkTileProvider` renders
  error boxes and every golden over it is a picture of a failure. Scoped to `lib/ui|screens|widgets`
  because that is the tree the pack's architecture keeps free of platform concerns; `main.dart` and
  the adapters beside it are where the real provider is legitimately constructed.
- **Mechanism:** a check
- **Retire when:** Retire it if the binding ever serves real requests, or if Flutter grows a
  first-class test-time image substitute that makes the constructor safe in the tree.
