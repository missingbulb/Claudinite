// Prose + one environment requirement. Fingerprint: a pubspec.yaml at the repo
// root OR one directory down (a monorepo's app/ or client/ dir) — but never
// deeper, so a stray pubspec.yaml in a nested example/fixture tree can't trip
// detection.
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'flutter',
  marker: 'pubspec.yaml (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'pubspec.yaml'),
  prose: 'RULES.md',
  rules: [],
  // The Flutter SDK isn't in the Claude Code Web base image, so a cloud session
  // can't run `flutter test` / analyze / golden regen without it. This declares
  // how the environment installs it (aggregated into environment-setup.sh) and
  // how the SessionStart check asserts it — see engine/pack_loader/env.mjs.
  env: {
    label: 'Flutter SDK',
    setup: [
      'if [ ! -x /opt/flutter/bin/flutter ]; then',
      '  git clone --depth 1 -b stable https://github.com/flutter/flutter.git /opt/flutter',
      'fi',
      'ln -sf /opt/flutter/bin/flutter /usr/local/bin/flutter',
      'ln -sf /opt/flutter/bin/dart /usr/local/bin/dart',
      'git config --global --add safe.directory /opt/flutter || true',
      'flutter --version || true',
      'flutter precache || true   # warm host engine artifacts so the first test is fast',
    ].join('\n'),
    probe: 'command -v flutter >/dev/null 2>&1',
  },
};
