---
name: flutter-port-architecture
description: Keeping plugins out of the Flutter widget tree — the committed import-scan test that enforces the port boundary, the shipped fakes and FakeWorld in lib/testing/, and the root shell in lib/app.dart that main.dart and the test harness share. Use when adding a port, a fake, a plugin adapter, or touching main.dart or the app shell.
metadata:
  force-load-on-file-edits-paths:
    - "**/lib/testing/**"
    - "**/lib/app.dart"
    - "**/lib/main.dart"
---

# Ports out of the widget tree

- **Enforce the boundary with a committed import-scan test** (dart:io over `lib/ui/`, `lib/screens/`
  looking for forbidden import prefixes). The analyzer won't stop a convenient leak.

- **Ship the fakes in the package** (`lib/testing/`): scripted fakes for each port that also
  *record* what the UI asked of them, plus a `FakeWorld` bundling them with a pinned clock and the
  real app shell. Both the app's own tests and any sibling test package (e.g. an
  executable-requirements suite) import one fake world — never two parallel ones.

- **Extract the root shell into a widget** (`lib/app.dart`) taking the ports as parameters, used
  identically by `main.dart` (adapters) and the test harness (fakes). Tests must never rebuild a
  parallel MaterialApp — actuals come from the shipped shell.
