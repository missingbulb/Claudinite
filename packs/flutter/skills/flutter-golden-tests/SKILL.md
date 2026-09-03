---
name: flutter-golden-tests
description: Widget-test and golden mechanics in Flutter — loading real fonts before a golden, fixed-duration pumps instead of pumpAndSettle around spinners, one fixed viewport per suite. Use when writing or debugging a widget test or golden, or when goldens render as boxes, hang, or drift.
metadata:
  force-load-on-file-edits-paths:
    - "**/*_test.dart"
    - "**/test/**/*.dart"
---

# Flutter widget tests and goldens

- **Load real fonts before any golden** — the test binding defaults to the glyph-less Ahem stub
  (text renders as boxes). Parse `FontManifest.json` from the root bundle and `FontLoader` every
  family (strip the `packages/<pkg>/` prefix so plain family names resolve), which also loads
  MaterialIcons; bundle text faces (e.g. Roboto) in the test package's pubspec. Watch for styles
  that don't inherit the theme's family — `ButtonStyle`/`styleFrom` text styles are the classic
  leak; pin `fontFamily` there explicitly.

- **Never `pumpAndSettle` around indeterminate progress indicators** — they schedule frames
  forever and the call never returns. Use fixed-duration pumps (`pump()` then
  `pump(Duration(...))`); this also makes an in-flight state (a spinner mid-send) a deterministic,
  golden-capturable frame. Corollary: after `tap()`, pump **twice** — one frame applies state, the
  fixed-duration pump advances implicit animations (ink ripples, color lerps) past the capture.

- **Fix the viewport per suite**: set `tester.view.physicalSize` and `devicePixelRatio` to one
  phone-shaped size (and reset in teardown) so layout — and therefore goldens — can't drift with
  the harness default.
