# Flutter

Portable, project-agnostic practices for Flutter / Dart codebases — true for any Flutter project
read cold. Earned in missingbulb/ShoutsAndWhispers (a Firebase-backed, location-driven app with an
executable-requirements UI suite); keep anything project-specific in the consuming repo's docs.

## Architecture: ports out of the widget tree

- **Widgets depend on ports, never on plugins.** Every platform/backend concern (location, auth,
  push, backend calls, the clock) enters the UI as a hand-written abstract interface with pure-Dart
  value types; plugin adapters (`geolocator`, `firebase_*`, `google_sign_in`, …) implement them and
  are constructed **only** in `main.dart`. A plugin type leaking into a screen (a geolocator
  `Position`, a `FirebaseFunctionsException`) is a defect: it silently couples every widget test to
  the plugin's platform channels.
- **Enforce the boundary with a committed import-scan test** (dart:io over `lib/ui/`, `lib/screens/`
  looking for forbidden import prefixes). The analyzer won't stop a convenient leak; a five-line
  test does.
- **Ship the fakes in the package** (`lib/testing/`): scripted fakes for each port that also
  *record* what the UI asked of them, plus a `FakeWorld` bundling them with a pinned clock and the
  real app shell. Both the app's own tests and any sibling test package (e.g. an
  executable-requirements suite) import one fake world — never two parallel ones.
- **Extract the root shell into a widget** (`lib/app.dart`) taking the ports as parameters, used
  identically by `main.dart` (adapters) and the test harness (fakes). Tests must never rebuild a
  parallel MaterialApp — actuals come from the shipped shell.
- **Inject the clock.** Any widget that formats or compares times takes a `Clock` port; relative
  time rendered from `DateTime.now()` is untestable and drifts goldens.

## Widget tests and goldens

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
- **Anything that fetches must be injectable**: map tile providers, avatar images. Widget tests
  block real HTTP (a 400-returning stub client), so a `NetworkImage`/network `TileProvider` in the
  tree means error boxes, not screenshots. Provide a deterministic in-memory substitute (a
  canvas-drawn `ImageProvider` works and needs no asset files).
- **Fix the viewport per suite**: set `tester.view.physicalSize` and `devicePixelRatio` to one
  phone-shaped size (and reset in teardown) so layout — and therefore goldens — can't drift with
  the harness default.
- **Async lifecycle guards need an epoch counter.** A `start()` that awaits (permission check,
  first fix) can re-arm streams/timers after `stop()`/dispose ran mid-await; bump an epoch in
  `stop()` and bail after every await if it changed. The symptom (leaked GPS subscription after
  sign-out) is invisible in tests that don't await realistically.

## Toolchain habits

- **Verify plugin APIs against the installed source, not memory.** Major Flutter plugins break
  their APIs often (google_sign_in v7's `authenticate()`, flutter_map v7+'s options, geolocator's
  settings objects); resolved versions live in the pub cache
  (`~/.pub-cache/hosted/pub.dev/<pkg>-<ver>/lib/`) — read them before writing against them.
- **`flutter analyze` at zero issues** (infos included) is the bar a suite holds; lints that fight
  a deliberate convention (e.g. `file_names` vs. leaf-id case filenames) get disabled narrowly in
  that package's `analysis_options.yaml` with the reason as a comment.
- **Sandboxed/CI runners**: `flutter test` can stall for minutes at teardown on GPU-less containers
  with dropped sockets. The pattern that holds: stream output, kill the process group the moment
  the definitive marker prints (`All tests passed!` / `Some tests failed`), watchdog-kill on output
  silence. On healthy machines plain `flutter test` is equivalent — keep the wrapper thin.
- **The web sandbox ships no Flutter SDK.** Claude Code on the web boots without Flutter, so tests,
  `flutter analyze`, and golden regen can't run until it's installed. Install belongs in the
  environment **image** (built once, snapshotted, reused) — never a per-session hook that reinstalls
  every start. This pack declares that need in its `env` block ([pack.mjs](pack.mjs)); a project pastes
  one generic `environment-setup.sh` that runs every active pack's requirement via
  [packs/env.mjs](../env.mjs) and asserts it at session start (see [bootstrap.md](../../bootstrap.md)
  Part 8).
