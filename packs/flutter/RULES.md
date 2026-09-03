# Flutter

## Architecture: ports out of the widget tree

- **Widgets depend on ports, never on plugins.** Every platform/backend concern (location, auth,
  push, backend calls, the clock) enters the UI as a hand-written abstract interface with pure-Dart
  value types; plugin adapters (`geolocator`, `firebase_*`, `google_sign_in`, …) implement them
  and are constructed **only** in `main.dart`. A plugin type leaking into a screen (a geolocator
  `Position`, a `FirebaseFunctionsException`) is a defect: it silently couples every widget test to
  the plugin's platform channels.
- **Inject the clock.** Any widget that formats or compares times takes a `Clock` port; relative
  time rendered from `DateTime.now()` is untestable and drifts goldens.

## Widget tests and goldens

- **Anything that fetches must be injectable**: map tile providers, avatar images. Widget tests
  block real HTTP (a 400-returning stub client), so a `NetworkImage`/network `TileProvider` in the
  tree means error boxes, not screenshots. Provide a deterministic in-memory substitute (a
  canvas-drawn `ImageProvider` works and needs no asset files).
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
